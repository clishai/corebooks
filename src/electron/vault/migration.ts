import fs from 'node:fs'
import path from 'node:path'
import { randomBytes } from 'node:crypto'
import Database from 'better-sqlite3-multiple-ciphers'
import { generateMnemonic, mnemonicToEntropy } from '@scure/bip39'
import { wordlist } from '@scure/bip39/wordlists/english.js'
import { generateVaultId, writeIdentity } from './identity.js'
import { createLockFile } from './lockFile.js'
import { writeSettings } from './settings.js'
import { writeWorkspace } from './workspace.js'
import { appendAuditEvent } from './audit.js'
import { DEFAULT_VAULT_SETTINGS, DEFAULT_VAULT_WORKSPACE } from './defaults.js'

export type FailPoint = 'after-backup' | 'after-rekey' | 'after-identity'

export interface MigrationArgs {
  vaultPath: string
  /** The old shared global key (from userData/.db.key). Caller owns this buffer's
   *  lifecycle; may zero it after `migrateLegacyVault` returns. */
  oldGlobalKey: Buffer
  password: string
  displayName: string
  __test_failAt?: FailPoint
}

export interface MigrationResult {
  recoveryPhrase: string
  /** The new per-vault encryption key. Caller must persist this to the OS keychain
   *  (via safeStorage / BiometricStore) and then zero it with `.fill(0)` once stored. */
  newKey: Buffer
}

/**
 * Upgrades a legacy "Plan F" vault (single-file `.corebooks` metadata +
 * DB keyed with a shared global key) to the new per-vault structure:
 *   .corebooks/           ← directory
 *     vault.json          ← identity
 *     lock.json           ← key slots (password + recovery)
 *     settings.json       ← per-vault settings
 *     workspace.json      ← UI state
 *     audit.jsonl         ← append-only audit chain
 *
 * Migration is atomic at the filesystem level:
 *   1. Legacy `.corebooks` file is renamed to `.corebooks.legacy-backup` first,
 *      freeing the path for the new directory.
 *   2. DB is copied to `corebooks.db.pre-migration` before rekeying.
 *   3. On any error, all new artifacts are removed and legacy state is restored
 *      so the vault can still be opened with the old key.
 *
 * Entropy passed to createLockFile is zeroed in a `finally` block.
 */
export async function migrateLegacyVault(args: MigrationArgs): Promise<MigrationResult> {
  const v = args.vaultPath
  const legacyFile = path.join(v, '.corebooks')
  const backupFile = path.join(v, '.corebooks.legacy-backup')
  const dbFile = path.join(v, 'corebooks.db')
  const dbBackup = path.join(v, 'corebooks.db.pre-migration')

  if (!fs.existsSync(legacyFile) || !fs.statSync(legacyFile).isFile()) {
    throw new Error('MigrationFailed: not a legacy vault')
  }

  // Step 1: rename legacy .corebooks file → backup (frees slot for directory)
  try {
    fs.renameSync(legacyFile, backupFile)
  } catch (err) {
    throw new Error(`MigrationFailed: could not rename .corebooks to backup — ${(err as Error).message}`)
  }

  try {
    // Step 2: back up DB before rekeying (preserves ability to roll back)
    fs.copyFileSync(dbFile, dbBackup)
    if (args.__test_failAt === 'after-backup') throw new Error('simulated failure during rekey')

    // Step 3: generate new per-vault K and rekey corebooks.db in place
    const newKey = randomBytes(32)
    rekeyDb(dbFile, args.oldGlobalKey, newKey)
    if (args.__test_failAt === 'after-rekey') throw new Error('simulated failure during identity write')

    // Step 4: create new .corebooks/ directory and write all sub-files
    fs.mkdirSync(path.join(v, '.corebooks'))

    const id = generateVaultId()
    writeIdentity(v, {
      schemaVersion: 1,
      id,
      displayName: args.displayName,
      created: new Date().toISOString(),
    })
    if (args.__test_failAt === 'after-identity') throw new Error('simulated failure during lock write')

    // Generate BIP-39 recovery phrase; entropy is zeroed after use
    const phrase = generateMnemonic(wordlist, 128)
    const entropy = Buffer.from(mnemonicToEntropy(phrase, wordlist))
    try {
      const lock = createLockFile(id, newKey, args.password, entropy)
      fs.writeFileSync(
        path.join(v, '.corebooks', 'lock.json'),
        JSON.stringify(lock, null, 2),
        { mode: 0o600 },
      )
    } finally {
      entropy.fill(0)
    }

    writeSettings(v, { ...structuredClone(DEFAULT_VAULT_SETTINGS), companyName: args.displayName })
    writeWorkspace(v, structuredClone(DEFAULT_VAULT_WORKSPACE))

    // Backup files (.corebooks.legacy-backup and corebooks.db.pre-migration) are
    // intentionally retained after successful migration as a recovery safety net.
    // The Electron IPC layer can surface a "clean up migration backups" action to
    // the user once they have verified the vault opens correctly.
    appendAuditEvent(v, {
      actor: 'system',
      event: 'vault.created',
      data: { id, displayName: args.displayName },
    })
    appendAuditEvent(v, {
      actor: 'migration',
      event: 'vault.migrated-from-legacy',
      data: { from: 'plan-f-single-file' },
    })

    return { recoveryPhrase: phrase, newKey }
  } catch (err) {
    // Roll back: remove any partial new artifacts and restore legacy state
    const newDir = path.join(v, '.corebooks')
    if (fs.existsSync(newDir) && fs.statSync(newDir).isDirectory()) {
      fs.rmSync(newDir, { recursive: true, force: true })
    }
    if (fs.existsSync(dbBackup)) {
      fs.copyFileSync(dbBackup, dbFile) // restore old-keyed DB
      fs.unlinkSync(dbBackup)
    }
    if (fs.existsSync(backupFile) && !fs.existsSync(legacyFile)) {
      fs.renameSync(backupFile, legacyFile)
    }
    throw err
  }
}

/**
 * Opens an existing SQLCipher database with `oldKey`, verifies it is
 * readable, then re-keys it to `newKey` using `PRAGMA rekey`.
 *
 * Using `sqlcipher_export` is not available in
 * `better-sqlite3-multiple-ciphers` — `PRAGMA rekey` on an already-opened
 * (and keyed) connection is the supported in-place migration path.
 *
 * Mutates dbFile in place: re-encrypts it with newKey using PRAGMA rekey. On failure the file may be in an indeterminate state (the backup copy in dbBackup is authoritative).
 */
function rekeyDb(dbFile: string, oldKey: Buffer, newKey: Buffer): void {
  const db = new Database(dbFile)
  try {
    db.pragma(`key = "x'${oldKey.toString('hex')}'"`)
    // Verify the old key actually unlocks the database before committing to rekey
    db.prepare('SELECT count(*) FROM sqlite_master').get()
    db.pragma(`rekey = "x'${newKey.toString('hex')}'"`)
  } finally {
    db.close()
  }
}
