import fs from 'node:fs'
import path from 'node:path'
import { randomBytes } from 'node:crypto'
import { generateMnemonic, mnemonicToEntropy } from '@scure/bip39'
import { wordlist } from '@scure/bip39/wordlists/english.js'
import type {
  ActiveVault, OpenResult, PickerEntry, PickerRegistry, VaultId,
} from './types.js'
import { generateVaultId, readIdentity, writeIdentity } from './identity.js'
import { createLockFile, unlockWithPassword, verifyHmac } from './lockFile.js'
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
    const lock = createLockFile(id, K, args.password, entropy)
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
    const lock = JSON.parse(fs.readFileSync(lockFilePath, 'utf-8'))
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

    const db = await this.cfg.dbFactory.open({ filePath: path.join(vaultPath, 'corebooks.db'), key: K })
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

  private updatePicker(vault: ActiveVault): void {
    const file = this.cfg.pickerRegistryPath
    const reg: PickerRegistry = fs.existsSync(file)
      ? JSON.parse(fs.readFileSync(file, 'utf-8'))
      : { vaults: [] }
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
