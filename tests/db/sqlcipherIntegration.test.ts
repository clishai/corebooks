import { describe, it, expect, afterEach } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import Database from 'better-sqlite3-multiple-ciphers'
import { openDatabase } from '../../src/db/openDatabase'
import { SqlCipherAdapterFactory } from '../../src/db/sqlcipherAdapter'

const KEY = 'a'.repeat(64) // 32-byte key as 64-char hex

function tempDbPath(): string {
  return path.join(
    os.tmpdir(),
    `corebooks-integration-${Date.now()}-${Math.random().toString(36).slice(2)}.db`,
  )
}

describe('SQLCipher integration', () => {
  const paths: string[] = []

  function newPath(): string {
    const p = tempDbPath()
    paths.push(p)
    return p
  }

  afterEach(() => {
    for (const p of paths) {
      try { fs.unlinkSync(p) } catch {}
      try { fs.unlinkSync(`${p}-wal`) } catch {}
      try { fs.unlinkSync(`${p}-shm`) } catch {}
      try { fs.unlinkSync(`${p}.tmp_enc`) } catch {}
    }
    paths.length = 0
  })

  describe('openDatabase + SqlCipherAdapterFactory round-trip', () => {
    it('creates encrypted DB, writes via adapter, reads back', async () => {
      const p = newPath()
      const db = openDatabase(p, KEY)
      db.exec('CREATE TABLE accounts (id INTEGER PRIMARY KEY, name TEXT NOT NULL, amount REAL)')
      db.close()

      // Re-open via adapter — adapter.dispose() will close this db instance
      const db2 = openDatabase(p, KEY)
      db2.exec("INSERT INTO accounts VALUES (1, 'Cash', 1000.50)")

      const factory = new SqlCipherAdapterFactory({ url: p }, db2)
      const adapter = await factory.connect()

      const qResult = await adapter.queryRaw({
        sql: 'SELECT id, name, amount FROM accounts WHERE id = 1',
        args: [],
        argTypes: [],
      })

      expect(qResult.columnNames).toEqual(['id', 'name', 'amount'])
      expect(qResult.rows).toHaveLength(1)
      expect(qResult.rows[0][1]).toBe('Cash')

      // dispose() closes db2 — do not call db2.close() again
      await adapter.dispose()
    })

    it('rejects wrong key — cannot read data', () => {
      const p = newPath()
      // Write data with correct key
      const db = openDatabase(p, KEY)
      db.exec('CREATE TABLE t (val TEXT)')
      db.exec("INSERT INTO t VALUES ('secret')")
      db.close()

      // Try to open with wrong key — openDatabase attempts migration which fails
      const wrongKey = 'b'.repeat(64)
      expect(() => openDatabase(p, wrongKey)).toThrow()
    })

    it('empty key on encrypted database throws descriptive error', () => {
      const p = newPath()
      const db = openDatabase(p, KEY)
      db.exec('CREATE TABLE t (val TEXT)')
      db.close()

      expect(() => openDatabase(p, '')).toThrow('Database appears to be encrypted')
    })
  })

  describe('plaintext migration', () => {
    it('migrates plaintext DB preserving all data', () => {
      const p = newPath()

      // Create plaintext DB with data
      const plain = new Database(p)
      plain.exec(`CREATE TABLE entries (
        id INTEGER PRIMARY KEY,
        description TEXT,
        amount REAL
      )`)
      plain.exec("INSERT INTO entries VALUES (1, 'Opening balance', 5000.00)")
      plain.exec("INSERT INTO entries VALUES (2, 'Rent payment', -1200.00)")
      plain.close()

      // Open with key — triggers migration via PRAGMA rekey
      const db = openDatabase(p, KEY)

      const rows = db.prepare('SELECT * FROM entries ORDER BY id').all() as Array<{
        id: number | bigint
        description: string
        amount: number
      }>

      expect(rows).toHaveLength(2)
      expect(rows[0].description).toBe('Opening balance')
      expect(Number(rows[0].amount)).toBeCloseTo(5000.00)
      expect(rows[1].description).toBe('Rent payment')
      expect(Number(rows[1].amount)).toBeCloseTo(-1200.00)

      db.close()

      // Verify file is now encrypted — opening without key must fail
      const bare = new Database(p)
      expect(() => {
        bare.prepare('SELECT count(*) FROM sqlite_master').get()
      }).toThrow()
      bare.close()
    })

    it('migrated file exists and is a valid encrypted database', () => {
      // Verify: after migration the file exists and can only be opened with the key.
      // The migration uses PRAGMA rekey (in-place), so no temp file is left behind.
      const p = newPath()
      const plain = new Database(p)
      plain.exec('CREATE TABLE t (val TEXT)')
      plain.exec("INSERT INTO t VALUES ('important data')")
      plain.close()

      const db = openDatabase(p, KEY)
      db.close()

      // File exists at original path (in-place migration)
      expect(fs.existsSync(p)).toBe(true)

      // Can re-open with correct key
      const db2 = openDatabase(p, KEY)
      const row = db2.prepare("SELECT val FROM t").get() as { val: string }
      expect(row.val).toBe('important data')
      db2.close()
    })
  })

  describe('security properties', () => {
    it('encrypted file contains no plaintext strings from inserted data', () => {
      const p = newPath()
      const db = openDatabase(p, KEY)
      db.exec('CREATE TABLE t (secret TEXT)')
      db.exec("INSERT INTO t VALUES ('COREBOOKS_SENTINEL_SECRET_VALUE')")
      db.close()

      const fileContents = fs.readFileSync(p)
      const str = fileContents.toString('binary')
      expect(str).not.toContain('COREBOOKS_SENTINEL_SECRET_VALUE')
    })

    it('two encrypted files with same key have different ciphertext (nonces differ)', () => {
      const p1 = newPath()
      const p2 = newPath()

      for (const p of [p1, p2]) {
        const db = openDatabase(p, KEY)
        db.exec('CREATE TABLE t (val TEXT)')
        db.exec("INSERT INTO t VALUES ('identical data')")
        db.close()
      }

      const buf1 = fs.readFileSync(p1)
      const buf2 = fs.readFileSync(p2)

      // Files will differ in header nonces even with same key+data
      expect(buf1.equals(buf2)).toBe(false)
    })

    it('key material does not appear in file contents', () => {
      const p = newPath()
      const db = openDatabase(p, KEY)
      db.exec('CREATE TABLE t (val TEXT)')
      db.close()

      const fileContents = fs.readFileSync(p)
      const hexInFile = fileContents.toString('hex')
      // The 64-char hex key should not appear literally in the file
      expect(hexInFile).not.toContain(KEY)
    })
  })

  describe('adapter transaction integrity', () => {
    it('rolled-back transaction does not persist data', async () => {
      const p = newPath()
      const db = openDatabase(p, KEY)
      db.exec('CREATE TABLE t (val TEXT)')

      const factory = new SqlCipherAdapterFactory({ url: p }, db)
      const adapter = await factory.connect()

      const tx = await adapter.startTransaction()
      await tx.executeRaw({ sql: "INSERT INTO t VALUES ('should not persist')", args: [], argTypes: [] })
      // Prisma issues ROLLBACK SQL before calling tx.rollback() (mirrors official adapter behaviour)
      await tx.executeRaw({ sql: 'ROLLBACK', args: [], argTypes: [] })
      await tx.rollback()

      const result = await adapter.queryRaw({ sql: 'SELECT count(*) as n FROM t', args: [], argTypes: [] })
      // count(*) with defaultSafeIntegers(true) returns a bigint; mapRow converts
      // safe bigints to numbers, so we accept either form.
      expect(Number(result.rows[0][0])).toBe(0)

      // dispose() closes the db instance
      await adapter.dispose()
    })

    it('committed transaction persists after close and reopen', async () => {
      const p = newPath()
      const db = openDatabase(p, KEY)
      db.exec('CREATE TABLE t (val TEXT)')

      const factory = new SqlCipherAdapterFactory({ url: p }, db)
      const adapter = await factory.connect()

      const tx = await adapter.startTransaction()
      await tx.executeRaw({ sql: "INSERT INTO t VALUES ('persisted')", args: [], argTypes: [] })
      // COMMIT the SQL transaction before signalling Prisma-level commit
      await adapter.executeRaw({ sql: 'COMMIT', args: [], argTypes: [] })
      await tx.commit()

      // dispose() closes the db handle
      await adapter.dispose()

      // Reopen and verify data survived
      const db2 = openDatabase(p, KEY)
      const row = db2.prepare('SELECT val FROM t').get() as { val: string }
      expect(row.val).toBe('persisted')
      db2.close()
    })
  })
})
