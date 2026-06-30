import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import type { VaultIdentity } from './types.js'

const VAULT_DIR = '.corebooks'
const IDENTITY_FILE = 'vault.json'

export function generateVaultId(): string {
  return randomUUID()
}

export function writeIdentity(vaultPath: string, identity: VaultIdentity): void {
  const file = path.join(vaultPath, VAULT_DIR, IDENTITY_FILE)
  fs.writeFileSync(file, JSON.stringify(identity, null, 2), { mode: 0o600 })
}

export function readIdentity(vaultPath: string): VaultIdentity {
  const file = path.join(vaultPath, VAULT_DIR, IDENTITY_FILE)
  if (!fs.existsSync(file)) throw new Error('VaultIdentityMissing')
  let parsed: unknown
  try {
    parsed = JSON.parse(fs.readFileSync(file, 'utf-8'))
  } catch {
    throw new Error('VaultIdentityInvalid: not valid JSON')
  }
  if (!isVaultIdentity(parsed)) throw new Error('VaultIdentityInvalid: schema mismatch')
  return parsed
}

function isVaultIdentity(v: unknown): v is VaultIdentity {
  if (!v || typeof v !== 'object') return false
  const o = v as Record<string, unknown>
  return (
    o['schemaVersion'] === 1 &&
    typeof o['id'] === 'string' &&
    typeof o['displayName'] === 'string' &&
    typeof o['created'] === 'string'
  )
}
