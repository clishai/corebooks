import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import type { VaultIdentity } from './types.js'

const VAULT_DIR = '.corebooks'
const IDENTITY_FILE = 'vault.json'

export type IdentityErrorCode = 'VaultIdentityMissing' | 'VaultIdentityInvalid'

function identityError(code: IdentityErrorCode, detail?: string): Error {
  const msg = detail ? `${code}: ${detail}` : code
  return Object.assign(new Error(msg), { code })
}

export function generateVaultId(): string {
  return randomUUID()
}

export function writeIdentity(vaultPath: string, identity: VaultIdentity): void {
  const dir = path.join(vaultPath, VAULT_DIR)
  const file = path.join(dir, IDENTITY_FILE)
  const tmp = path.join(dir, `${IDENTITY_FILE}.tmp-${process.pid}-${Date.now()}`)
  fs.writeFileSync(tmp, JSON.stringify(identity, null, 2), { mode: 0o600 })
  fs.renameSync(tmp, file)
  fs.chmodSync(file, 0o600)
}

export function readIdentity(vaultPath: string): VaultIdentity {
  const file = path.join(vaultPath, VAULT_DIR, IDENTITY_FILE)
  if (!fs.existsSync(file)) throw identityError('VaultIdentityMissing')
  let parsed: unknown
  try {
    parsed = JSON.parse(fs.readFileSync(file, 'utf-8'))
  } catch {
    throw identityError('VaultIdentityInvalid', 'not valid JSON')
  }
  if (!isVaultIdentity(parsed)) throw identityError('VaultIdentityInvalid', 'schema mismatch')
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
