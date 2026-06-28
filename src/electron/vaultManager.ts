import fs from 'fs'
import path from 'path'
import type {
  VaultEncryption,
  VaultEntry,
  VaultMetadata,
  VaultRegistry,
} from './vaultTypes.js'

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

  private readMetadata(vaultPath: string): VaultMetadata {
    const metaPath = path.join(vaultPath, '.corebooks')
    if (!fs.existsSync(metaPath)) {
      throw new Error(`Not a corebooks vault: ${vaultPath}`)
    }
    return JSON.parse(fs.readFileSync(metaPath, 'utf-8')) as VaultMetadata
  }

  private writeMetadata(vaultPath: string, meta: VaultMetadata): void {
    const metaPath = path.join(vaultPath, '.corebooks')
    fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2), { mode: 0o600 })
  }

  list(): VaultEntry[] {
    const { vaults } = this.readRegistry()
    return [...vaults].sort(
      (a, b) => new Date(b.lastOpened).getTime() - new Date(a.lastOpened).getTime(),
    )
  }

  create(name: string, dirPath: string): VaultEntry {
    const folderName = sanitizeVaultName(name)
    if (!folderName) throw new Error('Vault name is required')
    const vaultPath = path.join(dirPath, folderName)
    if (fs.existsSync(vaultPath)) {
      throw new Error('A vault with that name already exists')
    }

    fs.mkdirSync(vaultPath, { recursive: true })
    for (const sub of SUBDIRS) {
      fs.mkdirSync(path.join(vaultPath, sub), { recursive: true })
    }

    const metadata: VaultMetadata = {
      version: '1',
      name: folderName,
      created: new Date().toISOString(),
    }
    this.writeMetadata(vaultPath, metadata)

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
    const meta = this.readMetadata(vaultPath)
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
    if (!sanitized) throw new Error('Vault name is required')
    const parentDir = path.dirname(this.current.path)
    const newPath = path.join(parentDir, sanitized)
    if (path.resolve(newPath) !== path.resolve(this.current.path) && fs.existsSync(newPath)) {
      throw new Error('A vault with that name already exists')
    }

    const meta = this.readMetadata(this.current.path)
    fs.renameSync(this.current.path, newPath)
    meta.name = sanitized
    this.writeMetadata(newPath, meta)

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

  getSkipPickerUntil(): string | null {
    return this.readRegistry().skipPickerUntil ?? null
  }

  setSkipPickerUntil(until: string | null): void {
    const registry = this.readRegistry()
    if (until === null) {
      delete registry.skipPickerUntil
    } else {
      registry.skipPickerUntil = until
    }
    this.writeRegistry(registry)
  }

  // ── Vault encryption metadata ──────────────────────────────────────────────

  getEncryption(): VaultEncryption | null {
    if (!this.current) return null
    return this.readMetadata(this.current.path).encryption ?? null
  }

  setEncryption(enc: VaultEncryption): void {
    if (!this.current) throw new Error('No vault selected')
    const meta = this.readMetadata(this.current.path)
    meta.encryption = enc
    this.writeMetadata(this.current.path, meta)
  }

  removeEncryption(): void {
    if (!this.current) throw new Error('No vault selected')
    const meta = this.readMetadata(this.current.path)
    delete meta.encryption
    this.writeMetadata(this.current.path, meta)
  }
}
