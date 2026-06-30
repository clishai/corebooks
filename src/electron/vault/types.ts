export type VaultId = string // UUID v4

export interface VaultIdentity {
  schemaVersion: 1
  id: VaultId
  displayName: string
  created: string // ISO 8601
}

export interface VaultSettings {
  schemaVersion: 1
  companyName: string
  fiscalYearStart: { month: number; day: number }
  currency: string // ISO 4217
  paymentMethods: string[]
  featureFlags: { ar_ap: boolean; inventory: boolean }
}

export interface VaultWorkspace {
  schemaVersion: 1
  lastTab: string
  sidebarCollapsed: boolean
  recentEntries: string[]
}

export interface KeySlot {
  salt: string // hex, 32 bytes — Argon2id salt
  iv: string   // hex, 12 bytes — AES-GCM IV
  ct: string   // hex, 48 bytes — 32 ciphertext + 16 GCM tag
}

export interface LockFile {
  schemaVersion: 1
  argon2: { m: number; t: number; p: number }
  slots: { password: KeySlot; recovery: KeySlot }
  hmac: string // hex, 32 bytes
}

export type AuditActor = 'system' | 'human' | 'migration'

export interface AuditEvent {
  seq: number
  at: string // ISO 8601
  actor: AuditActor
  event: string
  data: unknown
  prevHash: string // hex, 32 bytes
  hash: string     // hex, 32 bytes
}

export interface PickerEntry {
  id: VaultId
  path: string
  displayName: string
  lastOpened: string // ISO 8601
}

export interface PickerRegistry {
  vaults: PickerEntry[]
}

export interface ActiveVault {
  id: VaultId
  path: string
  displayName: string
  apiPort: number
}

export type OpenResult =
  | { status: 'opened'; vault: ActiveVault }
  | { status: 'needs-password' }
  | { status: 'needs-settings-confirmation'; defaults: VaultSettings }
  | { status: 'busy'; lockedByPid: number }
  | { status: 'identity-mismatch' }
  | { status: 'lock-tampered' }
  | { status: 'legacy-needs-migration' }
