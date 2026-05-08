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

export interface VaultMetadata {
  version: string
  name: string
  created: string // ISO 8601
}

export interface VaultRegistry {
  vaults: VaultEntry[]
}
