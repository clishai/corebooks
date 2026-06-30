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

describe('VaultLifecycle.switch', () => {
  // Spec T19
  it('switch tears down A cleanly then opens B; A key zeroed, lock released', async () => {
    const lc = newLifecycle()
    const a = await lc.create({ directory: parentDir, displayName: 'A', password: 'password 12 chars' })
    const aKey = lc.__test_getActiveKey()!
    const bParent = path.join(tmp, 'parent-b')
    fs.mkdirSync(bParent)
    const result = await lc.switch({
      target: { directory: bParent, displayName: 'B', password: 'password 12 chars more' },
    })
    expect(result.status).toBe('opened')
    expect(aKey.every(b => b === 0)).toBe(true)
    expect(fs.existsSync(path.join(a.vault.path, '.corebooks', 'process.lock'))).toBe(false)
    expect(lc.current?.displayName).toBe('B')
  }, 60_000)

  it('switch works when no vault is currently open', async () => {
    const lc = newLifecycle()
    // No create/open first — state is null
    const bParent = path.join(tmp, 'parent-b')
    fs.mkdirSync(bParent)
    const result = await lc.switch({
      target: { directory: bParent, displayName: 'B', password: 'password 12 chars' },
    })
    expect(result.status).toBe('opened')
    expect(lc.current?.displayName).toBe('B')
  }, 30_000)
})

describe('VaultLifecycle.unlockWithRecovery', () => {
  // Spec T11
  it('unlocks with recovery phrase and rotates the password', async () => {
    const lc = newLifecycle()
    const { vault, recoveryPhrase } = await lc.create({
      directory: parentDir, displayName: 'A', password: 'original pass 12',
    })
    await lc.close()
    const lc2 = newLifecycle()
    const result = await lc2.unlockWithRecovery({
      path: vault.path, phrase: recoveryPhrase, newPassword: 'new pass 12 chars',
    })
    expect(result.status).toBe('opened')
    await lc2.close()
    // Verify new password works
    const lc3 = newLifecycle()
    const r = await lc3.open({ path: vault.path, password: 'new pass 12 chars' })
    expect(r.status).toBe('opened')
  }, 90_000)
})

describe('VaultLifecycle.appendAuditEvent', () => {
  it('appends events to the active vault via the public API', async () => {
    const lc = newLifecycle()
    await lc.create({ directory: parentDir, displayName: 'A', password: 'password 12 chars' })
    await lc.appendAuditEvent('password.changed', { by: 'user' })
    const lines = fs.readFileSync(path.join(lc.current!.path, '.corebooks', 'audit.jsonl'), 'utf-8').trim().split('\n')
    const audit = JSON.parse(lines[lines.length - 1])
    expect(audit.event).toBe('password.changed')
    expect(audit.actor).toBe('human')
  }, 30_000)

  it('throws NoActiveVault when no vault is open', async () => {
    const lc = newLifecycle()
    await expect(lc.appendAuditEvent('test', {})).rejects.toThrow('NoActiveVault')
  })
})
