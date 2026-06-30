import fs from 'node:fs'
import path from 'node:path'
import { randomBytes } from 'node:crypto'
import { generateMnemonic, mnemonicToEntropy, validateMnemonic } from '@scure/bip39'
import { wordlist } from '@scure/bip39/wordlists/english.js'
import type {
  ActiveVault, OpenResult, PickerEntry, PickerRegistry, VaultId,
} from './types.js'
import { generateVaultId, readIdentity, writeIdentity } from './identity.js'
import { createLockFile, unlockWithPassword, unlockWithRecovery as unwrapWithRecovery, verifyHmac } from './lockFile.js'
import { readSettings, writeSettings } from './settings.js'
import { writeWorkspace } from './workspace.js'
import { appendAuditEvent } from './audit.js'
import { acquireLock, releaseLock } from './processLock.js'
import { DEFAULT_VAULT_SETTINGS, DEFAULT_VAULT_WORKSPACE } from './defaults.js'
import type { BiometricStore } from './biometric.js'

const SUBDIRS = ['imports', 'statements', 'receipts', 'exports'] as const

export interface DbHandle { close(): Promise<void> }
export interface DbFactory {
  open(args: { filePath: string; key: Buffer }): Promise<DbHandle>
}

export interface VaultLifecycleConfig {
  dbFactory: DbFactory
  biometric: BiometricStore
  pickerRegistryPath: string
}

interface ActiveState {
  vault: ActiveVault
  key: Buffer
  db: DbHandle
}

export class VaultLifecycle {
  private state: ActiveState | null = null
  private cfg: VaultLifecycleConfig

  constructor(cfg: VaultLifecycleConfig) { this.cfg = cfg }

  get current(): Readonly<ActiveVault> | null { return this.state?.vault ?? null }

  /** Test-only — returns the live key buffer so tests can verify zeroing. */
  __test_getActiveKey(): Buffer | null { return this.state?.key ?? null }

  async create(args: { directory: string; displayName: string; password: string }): Promise<{
    vault: ActiveVault
    recoveryPhrase: string
  }> {
    if (args.password.length < 12) throw new Error('VaultPasswordTooShort')
    const sanitized = sanitizeVaultName(args.displayName)
    if (!sanitized) throw new Error('VaultDisplayNameRequired')
    const vaultPath = path.join(args.directory, sanitized)
    if (fs.existsSync(vaultPath)) throw new Error('VaultPathExists')

    fs.mkdirSync(vaultPath, { recursive: true })
    try {
      fs.mkdirSync(path.join(vaultPath, '.corebooks'))
      for (const sub of SUBDIRS) fs.mkdirSync(path.join(vaultPath, sub))

      const id: VaultId = generateVaultId()
      writeIdentity(vaultPath, {
        schemaVersion: 1,
        id,
        displayName: sanitized,
        created: new Date().toISOString(),
      })

      const K = randomBytes(32)
      const phrase = generateMnemonic(wordlist, 128) // 12 words
      const entropy = Buffer.from(mnemonicToEntropy(phrase, wordlist))
      let lock: ReturnType<typeof createLockFile>
      try {
        lock = createLockFile(id, K, args.password, entropy)
      } finally {
        entropy.fill(0)
      }
      fs.writeFileSync(path.join(vaultPath, '.corebooks', 'lock.json'), JSON.stringify(lock, null, 2), { mode: 0o600 })

      writeSettings(vaultPath, { ...structuredClone(DEFAULT_VAULT_SETTINGS), companyName: sanitized })
      writeWorkspace(vaultPath, structuredClone(DEFAULT_VAULT_WORKSPACE))

      appendAuditEvent(vaultPath, { actor: 'system', event: 'vault.created', data: { id, displayName: sanitized } })

      const lockResult = acquireLock(vaultPath)
      if (lockResult.status === 'busy') throw new Error('VaultBusy: just-created vault is already locked?')

      const db = await this.cfg.dbFactory.open({ filePath: path.join(vaultPath, 'corebooks.db'), key: K })

      const vault: ActiveVault = { id, path: vaultPath, displayName: sanitized, apiPort: 0 }
      this.state = { vault, key: K, db }
      appendAuditEvent(vaultPath, { actor: 'system', event: 'vault.opened', data: {} })
      this.updatePicker(vault)
      return { vault, recoveryPhrase: phrase }
    } catch (err) {
      fs.rmSync(vaultPath, { recursive: true, force: true })
      throw err
    }
  }

  async open(args: { path: string; password?: string }): Promise<OpenResult> {
    const vaultPath = args.path
    // Detect legacy vault (single-file .corebooks instead of directory)
    const corebooksPath = path.join(vaultPath, '.corebooks')
    if (fs.existsSync(corebooksPath) && fs.statSync(corebooksPath).isFile()) {
      return { status: 'legacy-needs-migration' }
    }
    let identity
    try {
      identity = readIdentity(vaultPath)
    } catch {
      return { status: 'identity-mismatch' }
    }

    const lockFilePath = path.join(vaultPath, '.corebooks', 'lock.json')
    if (!fs.existsSync(lockFilePath)) return { status: 'identity-mismatch' }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let lock: any // untrusted JSON; validated by verifyHmac before use
    try {
      lock = JSON.parse(fs.readFileSync(lockFilePath, 'utf-8'))
    } catch {
      return { status: 'lock-tampered' }
    }
    if (!verifyHmac(lock, identity.id)) return { status: 'lock-tampered' }

    if (!args.password) return { status: 'needs-password' }

    const lockResult = acquireLock(vaultPath)
    if (lockResult.status === 'busy') return { status: 'busy', lockedByPid: lockResult.lockedByPid }
    if (lockResult.status === 'reclaimed') {
      appendAuditEvent(vaultPath, {
        actor: 'system',
        event: 'vault.lock-reclaimed',
        data: { previousPid: lockResult.previousPid >= 0 ? lockResult.previousPid : null },
      })
    }

    let K: Buffer
    try {
      K = unlockWithPassword(lock, identity.id, args.password)
    } catch {
      releaseLock(vaultPath)
      return { status: 'needs-password' }
    }

    // Settings check before completing open
    try {
      readSettings(vaultPath)
    } catch (err) {
      if (String(err).includes('VaultSettingsMissing') || String(err).includes('VaultSettingsInvalid')) {
        K.fill(0)
        releaseLock(vaultPath)
        return { status: 'needs-settings-confirmation', defaults: structuredClone(DEFAULT_VAULT_SETTINGS) }
      }
      K.fill(0)
      releaseLock(vaultPath)
      throw err
    }

    let db: DbHandle
    try {
      db = await this.cfg.dbFactory.open({ filePath: path.join(vaultPath, 'corebooks.db'), key: K })
    } catch (err) {
      K.fill(0)
      releaseLock(vaultPath)
      throw err
    }
    const vault: ActiveVault = { id: identity.id, path: vaultPath, displayName: identity.displayName, apiPort: 0 }
    this.state = { vault, key: K, db }
    appendAuditEvent(vaultPath, { actor: 'system', event: 'vault.opened', data: {} })
    this.updatePicker(vault)
    return { status: 'opened', vault }
  }

  async close(): Promise<void> {
    if (!this.state) return
    const { vault, key, db } = this.state
    appendAuditEvent(vault.path, { actor: 'system', event: 'vault.closed', data: {} })
    await db.close()
    key.fill(0)
    releaseLock(vault.path)
    this.state = null
  }

  /**
   * Close the current vault (if any) and open a different one atomically.
   * Pass `target.directory + displayName + password` to create a new vault,
   * or `target.path + password` to open an existing one.
   *
   * No Electron relaunch needed — the Prisma/DB client lives on this lifecycle
   * instance, not as a module-level singleton.
   */
  async switch(args: {
    target:
      | { directory: string; displayName: string; password: string }
      | { path: string; password: string }
  }): Promise<OpenResult> {
    await this.close()
    if ('directory' in args.target) {
      const { vault } = await this.create(args.target)
      return { status: 'opened', vault }
    }
    return this.open(args.target)
  }

  /**
   * Unlock a vault using its BIP-39 recovery phrase, then immediately rotate
   * the password slot to `newPassword` (same K and recovery slot retained).
   * This is the "forgot password" recovery path.
   */
  async unlockWithRecovery(args: { path: string; phrase: string; newPassword: string }): Promise<OpenResult> {
    if (args.newPassword.length < 12) throw new Error('VaultPasswordTooShort')
    if (!validateMnemonic(args.phrase, wordlist)) throw new Error('VaultRecoveryPhraseInvalid')

    const identity = readIdentity(args.path)
    const lockFilePath = path.join(args.path, '.corebooks', 'lock.json')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let lock: any // untrusted JSON; validated by verifyHmac before use
    try {
      lock = JSON.parse(fs.readFileSync(lockFilePath, 'utf-8'))
    } catch {
      return { status: 'lock-tampered' }
    }
    if (!verifyHmac(lock, identity.id)) return { status: 'lock-tampered' }

    const entropy = Buffer.from(mnemonicToEntropy(args.phrase, wordlist))
    let K: Buffer
    try {
      K = unwrapWithRecovery(lock, identity.id, entropy)
    } catch (err) {
      entropy.fill(0)
      throw err
    }

    // Acquire process lock BEFORE rewriting lock.json so that if another process
    // holds the vault the password slot is not rotated on disk without a successful open.
    const lockResult = acquireLock(args.path)
    if (lockResult.status === 'busy') {
      K.fill(0)
      entropy.fill(0)
      return { status: 'busy', lockedByPid: lockResult.lockedByPid }
    }

    // Rewrite lock.json with new password slot; same K and recovery slot remain.
    let newLock: ReturnType<typeof createLockFile>
    try {
      newLock = createLockFile(identity.id, K, args.newPassword, entropy)
    } finally {
      entropy.fill(0)
    }
    fs.writeFileSync(lockFilePath, JSON.stringify(newLock, null, 2), { mode: 0o600 })
    appendAuditEvent(args.path, { actor: 'human', event: 'password.rotated-via-recovery', data: {} })

    let db: DbHandle
    try {
      db = await this.cfg.dbFactory.open({ filePath: path.join(args.path, 'corebooks.db'), key: K })
    } catch (err) {
      K.fill(0)
      releaseLock(args.path)
      throw err
    }

    const vault: ActiveVault = { id: identity.id, path: args.path, displayName: identity.displayName, apiPort: 0 }
    this.state = { vault, key: K, db }
    appendAuditEvent(args.path, { actor: 'system', event: 'vault.opened', data: {} })
    this.updatePicker(vault)
    return { status: 'opened', vault }
  }

  /**
   * Append a non-system audit event to the currently-open vault.
   * The actor is always 'human' — use this for user-initiated events
   * (password changes, biometric toggles, etc.).
   */
  async appendAuditEvent(event: string, data: unknown): Promise<void> {
    if (!this.state) throw new Error('NoActiveVault')
    appendAuditEvent(this.state.vault.path, { actor: 'human', event, data })
  }

  private updatePicker(vault: ActiveVault): void {
    const file = this.cfg.pickerRegistryPath
    let reg: PickerRegistry = { vaults: [] }
    if (fs.existsSync(file)) {
      try {
        reg = JSON.parse(fs.readFileSync(file, 'utf-8')) as PickerRegistry
      } catch {
        // Corrupt picker.json — reset to empty rather than blocking vault open
        reg = { vaults: [] }
      }
    }
    const now = new Date().toISOString()
    const existing = reg.vaults.find(v => v.id === vault.id)
    const entry: PickerEntry = { id: vault.id, path: vault.path, displayName: vault.displayName, lastOpened: now }
    if (existing) {
      Object.assign(existing, entry)
    } else {
      reg.vaults.push(entry)
    }
    fs.writeFileSync(file, JSON.stringify(reg, null, 2), { mode: 0o600 })
  }
}

function sanitizeVaultName(name: string): string {
  return name.replace(/[/\\:*?"<>|]/g, '').trim().replace(/\s+/g, ' ').slice(0, 64)
}
