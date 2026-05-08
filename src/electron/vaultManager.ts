import fs from 'fs'
import path from 'path'
import type { VaultEntry, VaultMetadata, VaultRegistry } from './vaultTypes.js'

const SUBDIRS = ['imports', 'statements', 'receipts', 'exports']

export function sanitizeVaultName(name: string): string {
  return name
    .replace(/[/\\:*?"<>|]/g, '')
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, 64)
}

export class VaultManager {
  private registryPath: string
  private current: VaultEntry | null = null

  constructor(userData: string) {
    this.registryPath = path.join(userData, 'vaults.json')
  }

  private readRegistry(): VaultRegistry {
    try {
      const raw = fs.readFileSync(this.registryPath, 'utf-8')
      return JSON.parse(raw) as VaultRegistry
    } catch {
      return { vaults: [] }
    }
  }

  private writeRegistry(registry: VaultRegistry): void {
    fs.writeFileSync(this.registryPath, JSON.stringify(registry, null, 2), { mode: 0o600 })
  }

  list(): VaultEntry[] {
    const { vaults } = this.readRegistry()
    return [...vaults].sort(
      (a, b) => new Date(b.lastOpened).getTime() - new Date(a.lastOpened).getTime(),
    )
  }

  create(name: string, dirPath: string): VaultEntry {
    const folderName = sanitizeVaultName(name)
    const vaultPath = path.join(dirPath, folderName)

    fs.mkdirSync(vaultPath, { recursive: true })
    for (const sub of SUBDIRS) {
      fs.mkdirSync(path.join(vaultPath, sub), { recursive: true })
    }

    const metadata: VaultMetadata = {
      version: '1',
      name: folderName,
      created: new Date().toISOString(),
    }
    fs.writeFileSync(
      path.join(vaultPath, '.corebooks'),
      JSON.stringify(metadata, null, 2),
      { mode: 0o600 },
    )

    const entry: VaultEntry = {
      path: vaultPath,
      name: folderName,
      lastOpened: new Date().toISOString(),
    }

    const registry = this.readRegistry()
    registry.vaults.push(entry)
    this.writeRegistry(registry)

    return entry
  }

  select(vaultPath: string): VaultEntry {
    const metaPath = path.join(vaultPath, '.corebooks')
    if (!fs.existsSync(metaPath)) {
      throw new Error(`Not a corebooks vault: ${vaultPath}`)
    }

    const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8')) as VaultMetadata
    const now = new Date().toISOString()

    const registry = this.readRegistry()
    const existing = registry.vaults.find((v) => v.path === vaultPath)

    if (existing) {
      existing.lastOpened = now
      existing.name = meta.name
    } else {
      registry.vaults.push({ path: vaultPath, name: meta.name, lastOpened: now })
    }
    this.writeRegistry(registry)

    const entry: VaultEntry = { path: vaultPath, name: meta.name, lastOpened: now }
    this.current = entry
    return entry
  }

  getCurrent(): VaultEntry | null {
    return this.current
  }

  rename(newName: string): string {
    if (!this.current) throw new Error('No vault selected')

    const sanitized = sanitizeVaultName(newName)
    const parentDir = path.dirname(this.current.path)
    const newPath = path.join(parentDir, sanitized)

    const metaPath = path.join(this.current.path, '.corebooks')
    const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8')) as VaultMetadata
    meta.name = sanitized
    fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2))

    fs.renameSync(this.current.path, newPath)

    const registry = this.readRegistry()
    const entry = registry.vaults.find((v) => v.path === this.current!.path)
    if (entry) {
      entry.path = newPath
      entry.name = sanitized
    }
    this.writeRegistry(registry)

    this.current = { ...this.current, path: newPath, name: sanitized }
    return newPath
  }

  removeFromRegistry(vaultPath: string): void {
    const registry = this.readRegistry()
    registry.vaults = registry.vaults.filter((v) => v.path !== vaultPath)
    this.writeRegistry(registry)
  }
}
