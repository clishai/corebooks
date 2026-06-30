import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import Database from 'better-sqlite3-multiple-ciphers'
import { migrateLegacyVault } from '../../../src/electron/vault/migration.js'
import { readIdentity } from '../../../src/electron/vault/identity.js'
import { readAuditLog } from '../../../src/electron/vault/audit.js'

let tmp: string
const OLD_KEY = Buffer.from('0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef', 'hex')

function makeLegacyVault(): string {
  const v = path.join(tmp, 'LegacyVault')
  fs.mkdirSync(v)
  for (const sub of ['imports', 'statements', 'receipts', 'exports']) fs.mkdirSync(path.join(v, sub))
  fs.writeFileSync(path.join(v, '.corebooks'), JSON.stringify({ version: '1', name: 'LegacyVault', created: '2025-01-01T00:00:00Z' }), { mode: 0o600 })
  // Create a SQLCipher DB keyed with the old global key
  const dbPath = path.join(v, 'corebooks.db')
  const db = new Database(dbPath)
  db.pragma(`key = "x'${OLD_KEY.toString('hex')}'"`)
  db.exec('CREATE TABLE marker (id INTEGER PRIMARY KEY, value TEXT)')
  db.prepare('INSERT INTO marker VALUES (1, ?)').run('legacy-data')
  db.close()
  return v
}

beforeEach(() => { tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cb-mig-')) })
afterEach(() => { fs.rmSync(tmp, { recursive: true, force: true }) })

describe('migration', () => {
  // Spec T6
  it('migrates a legacy vault to the new structure', async () => {
    const v = makeLegacyVault()
    const result = await migrateLegacyVault({
      vaultPath: v, oldGlobalKey: OLD_KEY, password: 'migration pw 12c', displayName: 'LegacyVault',
    })
    expect(result.recoveryPhrase.split(' ')).toHaveLength(12)
    expect(fs.existsSync(path.join(v, '.corebooks.legacy-backup'))).toBe(true)
    expect(fs.existsSync(path.join(v, 'corebooks.db.pre-migration'))).toBe(true)
    expect(fs.statSync(path.join(v, '.corebooks')).isDirectory()).toBe(true)
    const id = readIdentity(v)
    expect(id.displayName).toBe('LegacyVault')
    const audit = readAuditLog(v)
    expect(audit[0].event).toBe('vault.created')
    expect(audit.some(e => e.event === 'vault.migrated-from-legacy')).toBe(true)
    // Verify the rekeyed DB is readable with the new K
    const db = new Database(path.join(v, 'corebooks.db'))
    db.pragma(`key = "x'${result.newKey.toString('hex')}'"`)
    const row = db.prepare('SELECT value FROM marker WHERE id = 1').get() as { value: string }
    expect(row.value).toBe('legacy-data')
    db.close()
  }, 60_000)

  // Spec T7 — three injected failure points
  it.each([
    ['after-backup',   'simulated failure during rekey'],
    ['after-rekey',    'simulated failure during identity write'],
    ['after-identity', 'simulated failure during lock write'],
  ])('aborts on failure at %s and restores legacy state', async (point, msg) => {
    const v = makeLegacyVault()
    await expect(
      migrateLegacyVault({
        vaultPath: v, oldGlobalKey: OLD_KEY, password: 'migration pw 12c', displayName: 'LegacyVault',
        __test_failAt: point as 'after-backup' | 'after-rekey' | 'after-identity',
      })
    ).rejects.toThrow(/simulated|MigrationFailed/)
    // Legacy state restored
    expect(fs.statSync(path.join(v, '.corebooks')).isFile()).toBe(true)
    // DB still openable with old key
    const db = new Database(path.join(v, 'corebooks.db'))
    db.pragma(`key = "x'${OLD_KEY.toString('hex')}'"`)
    const row = db.prepare('SELECT value FROM marker WHERE id = 1').get() as { value: string }
    expect(row.value).toBe('legacy-data')
    db.close()
  }, 60_000)
})
