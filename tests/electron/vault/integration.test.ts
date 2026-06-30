import { it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { VaultLifecycle, type DbFactory } from '../../../src/electron/vault/lifecycle.js'
import { createPrismaClient } from '../../../src/db/client.js'
import { FakeBackend, createBiometricStore } from '../../../src/electron/vault/biometric.js'

let tmp: string
beforeEach(() => { tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cb-int-')) })
afterEach(() => { fs.rmSync(tmp, { recursive: true, force: true }) })

// Spec T23
it('full lifecycle: create → write → close → reopen → switch → second vault data isolated', async () => {
  const dbFactory: DbFactory = {
    async open({ filePath, key }) {
      const { client, db } = createPrismaClient({ filePath, key })
      db.exec(`CREATE TABLE IF NOT EXISTS smoke (id INTEGER PRIMARY KEY, val TEXT NOT NULL)`)
      return {
        async close() {
          await client.$disconnect()
          // $disconnect() closes the underlying better-sqlite3 connection;
          // calling db.close() again would throw — ignore the error.
          try { db.close() } catch { /* already closed by Prisma */ }
        },
      }
    },
  }
  const pickerPath = path.join(tmp, 'picker.json')
  const lc = new VaultLifecycle({
    dbFactory,
    biometric: createBiometricStore(new FakeBackend()),
    pickerRegistryPath: pickerPath,
  })

  // ── Vault A ──────────────────────────────────────────────────────────────────
  const dirA = path.join(tmp, 'pa')
  fs.mkdirSync(dirA)
  const a = await lc.create({ directory: dirA, displayName: 'A', password: 'password-A-12ch' })

  // Copy the key buffer BEFORE close() zeros it.
  const keyAHex = lc.__test_getActiveKey()!.toString('hex')

  // Write data directly to A's encrypted DB using the active key.
  const Database = (await import('better-sqlite3-multiple-ciphers')).default
  const dbA = new Database(path.join(a.vault.path, 'corebooks.db'))
  dbA.pragma(`key = "x'${keyAHex}'"`)
  dbA.prepare('INSERT INTO smoke (val) VALUES (?)').run('A-data')
  dbA.close()

  await lc.close()

  // ── Reopen A ─────────────────────────────────────────────────────────────────
  const reopen = await lc.open({ path: a.vault.path, password: 'password-A-12ch' })
  expect(reopen.status).toBe('opened')
  await lc.close()

  // ── Vault B ──────────────────────────────────────────────────────────────────
  const dirB = path.join(tmp, 'pb')
  fs.mkdirSync(dirB)
  const b = await lc.create({ directory: dirB, displayName: 'B', password: 'password-B-12ch' })

  // Copy B's key before close() zeros it.
  const keyBHex = lc.__test_getActiveKey()!.toString('hex')

  // B's DB must NOT contain A's data — vaults are fully isolated.
  const dbB = new Database(path.join(b.vault.path, 'corebooks.db'))
  dbB.pragma(`key = "x'${keyBHex}'"`)
  const row = dbB.prepare('SELECT val FROM smoke').get() as { val: string } | undefined
  expect(row).toBeUndefined()
  dbB.close()

  await lc.close()

  // ── Wrong-key rejection ───────────────────────────────────────────────────────
  // A key of all 0xFF must not open A's database — encryption is enforced.
  const dbAFail = new Database(path.join(a.vault.path, 'corebooks.db'))
  const wrong = Buffer.alloc(32, 0xff)
  dbAFail.pragma(`key = "x'${wrong.toString('hex')}'"`)
  expect(() => dbAFail.prepare('SELECT * FROM smoke').get()).toThrow()
  dbAFail.close()
}, 120_000)
