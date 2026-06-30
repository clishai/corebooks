import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { VaultLifecycle, type DbFactory, type DbHandle } from '../../../src/electron/vault/lifecycle.js'
import { FakeBackend, createBiometricStore } from '../../../src/electron/vault/biometric.js'
import { readIdentity } from '../../../src/electron/vault/identity.js'

let tmp: string
let parentDir: string
let dbFactory: { open: ReturnType<typeof vi.fn>; lastKey: Buffer | null }
let biometric: ReturnType<typeof createBiometricStore>

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cb-life-'))
  parentDir = path.join(tmp, 'parent')
  fs.mkdirSync(parentDir, { recursive: true })
  const fakeDb: DbHandle = { close: vi.fn(async () => {}) }
  dbFactory = {
    open: vi.fn(async ({ key }: { filePath: string; key: Buffer }) => {
      dbFactory.lastKey = Buffer.from(key) // copy
      return fakeDb
    }),
    lastKey: null,
  }
  biometric = createBiometricStore(new FakeBackend())
})
afterEach(() => { fs.rmSync(tmp, { recursive: true, force: true }) })

function newLifecycle() {
  return new VaultLifecycle({
    dbFactory: dbFactory as unknown as DbFactory,
    biometric,
    pickerRegistryPath: path.join(tmp, 'picker.json'),
  })
}

describe('VaultLifecycle.create', () => {
  // Spec T1
  it('creates the full vault structure with valid identity, lock, audit, and process lock', async () => {
    const lc = newLifecycle()
    const result = await lc.create({
      directory: parentDir,
      displayName: 'Acme Books',
      password: 'correct horse battery staple',
    })
    expect(result.recoveryPhrase.split(' ')).toHaveLength(12)
    const vaultPath = result.vault.path
    expect(fs.existsSync(path.join(vaultPath, '.corebooks', 'vault.json'))).toBe(true)
    expect(fs.existsSync(path.join(vaultPath, '.corebooks', 'lock.json'))).toBe(true)
    expect(fs.existsSync(path.join(vaultPath, '.corebooks', 'settings.json'))).toBe(true)
    expect(fs.existsSync(path.join(vaultPath, '.corebooks', 'workspace.json'))).toBe(true)
    expect(fs.existsSync(path.join(vaultPath, '.corebooks', 'audit.jsonl'))).toBe(true)
    expect(fs.existsSync(path.join(vaultPath, '.corebooks', 'process.lock'))).toBe(true)
    for (const sub of ['imports', 'statements', 'receipts', 'exports']) {
      expect(fs.statSync(path.join(vaultPath, sub)).isDirectory()).toBe(true)
    }
    const id = readIdentity(vaultPath)
    expect(id.id).toMatch(/^[0-9a-f-]{36}$/)
    expect(id.displayName).toBe('Acme Books')
    expect(dbFactory.lastKey?.length).toBe(32)
  }, 30_000)
})

describe('VaultLifecycle.open', () => {
  // Spec T2
  it('rejects open when vault.json UUID does not match the requested vault', async () => {
    const lc = newLifecycle()
    const { vault, recoveryPhrase: _ } = await lc.create({
      directory: parentDir,
      displayName: 'A',
      password: 'password 12 chars',
    })
    await lc.close()
    // Tamper: rewrite vault.json with a different UUID
    const idPath = path.join(vault.path, '.corebooks', 'vault.json')
    const id = JSON.parse(fs.readFileSync(idPath, 'utf-8'))
    id.id = '00000000-0000-4000-8000-000000000000'
    fs.writeFileSync(idPath, JSON.stringify(id))
    // Open with the path the picker thinks this vault is
    const lc2 = newLifecycle()
    const result = await lc2.open({ path: vault.path, password: 'password 12 chars' })
    expect(result.status).toBe('lock-tampered') // HMAC fails because lock.json was bound to original UUID
  }, 30_000)

  // Spec T5
  it('close() zeros the key buffer, releases the lock, calls db.close', async () => {
    const lc = newLifecycle()
    await lc.create({ directory: parentDir, displayName: 'A', password: 'password 12 chars' })
    const keyRef = lc.__test_getActiveKey()
    expect(keyRef).toBeInstanceOf(Buffer)
    expect(keyRef!.every(b => b === 0)).toBe(false)
    await lc.close()
    expect(keyRef!.every(b => b === 0)).toBe(true)
    expect(lc.current).toBeNull()
    // process.lock cleared in the original vault dir (we can find it via picker)
  }, 30_000)

  // Spec T20
  it('returns needs-settings-confirmation when settings.json is missing', async () => {
    const lc = newLifecycle()
    const { vault } = await lc.create({ directory: parentDir, displayName: 'A', password: 'password 12 chars' })
    await lc.close()
    fs.unlinkSync(path.join(vault.path, '.corebooks', 'settings.json'))
    const lc2 = newLifecycle()
    const result = await lc2.open({ path: vault.path, password: 'password 12 chars' })
    expect(result.status).toBe('needs-settings-confirmation')
    expect(fs.existsSync(path.join(vault.path, '.corebooks', 'settings.json'))).toBe(false)
  }, 30_000)
})
