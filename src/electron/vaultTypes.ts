export interface VaultEntry {
  path: string
  name: string
  lastOpened: string // ISO 8601
}

export interface VaultState {
  apiPort: number | null
  vaultName: string | null
  vaultPath: string | null
}

/**
 * One of the two AES-256-GCM-wrapped copies of the vault key K. Both slots
 * encrypt the SAME K — only the wrapping key (derived from password vs.
 * recovery-phrase entropy) differs between them.
 */
export interface VaultKeySlot {
  salt: string   // hex, 32 bytes — Argon2id salt
  iv: string     // hex, 12 bytes — AES-GCM IV
  ct: string     // hex, 48 bytes — 32 ciphertext + 16 GCM auth tag
}

export interface VaultEncryption {
  algorithm: 'argon2id-aes256-gcm'
  argon2: { m: number; t: number; p: number }
  slots: {
    password: VaultKeySlot
    recovery: VaultKeySlot
  }
}

export interface VaultMetadata {
  version: string
  name: string
  created: string // ISO 8601
  encryption?: VaultEncryption
}

export interface VaultRegistry {
  vaults: VaultEntry[]
  skipPickerUntil?: string // ISO 8601 — if in future, auto-open last vault on startup
}
