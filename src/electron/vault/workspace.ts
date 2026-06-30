import fs from 'node:fs'
import path from 'node:path'
import type { VaultWorkspace } from './types.js'
import { DEFAULT_VAULT_WORKSPACE } from './defaults.js'

export const CURRENT_WORKSPACE_VERSION = 1

const WORKSPACE_FILE = path.join('.corebooks', 'workspace.json')

export function readWorkspace(vaultPath: string): VaultWorkspace {
  const file = path.join(vaultPath, WORKSPACE_FILE)
  if (!fs.existsSync(file)) {
    writeWorkspace(vaultPath, DEFAULT_VAULT_WORKSPACE)
    return structuredClone(DEFAULT_VAULT_WORKSPACE)
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf-8'))
    if (isValidWorkspace(parsed)) return parsed
    throw new Error('shape mismatch')
  } catch {
    writeWorkspace(vaultPath, DEFAULT_VAULT_WORKSPACE)
    return structuredClone(DEFAULT_VAULT_WORKSPACE)
  }
}

export function writeWorkspace(vaultPath: string, workspace: VaultWorkspace): void {
  const file = path.join(vaultPath, WORKSPACE_FILE)
  fs.writeFileSync(file, JSON.stringify(workspace, null, 2), { mode: 0o600 })
}

function isValidWorkspace(v: unknown): v is VaultWorkspace {
  if (!v || typeof v !== 'object') return false
  const o = v as Record<string, unknown>
  return (
    o['schemaVersion'] === CURRENT_WORKSPACE_VERSION &&
    typeof o['lastTab'] === 'string' &&
    typeof o['sidebarCollapsed'] === 'boolean' &&
    Array.isArray(o['recentEntries'])
  )
}
