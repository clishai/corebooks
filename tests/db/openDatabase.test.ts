import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import Database from 'better-sqlite3-multiple-ciphers'
import { openDatabase } from '../../src/db/openDatabase'

const KEY_HEX = '0'.repeat(64) // 32-byte key as 64-char hex
const KEY = Buffer.from(KEY_HEX, 'hex')

function tempDbPath(): string {
  return path.join(os.tmpdir(), `corebooks-test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`)
}

describe('openDatabase', () => {
  const paths: string[] = []

  function newPath(): string {
    const p = tempDbPath()
    paths.push(p)
    return p
  }

  afterEach(() => {
    for (const p of paths) {
      try { fs.unlinkSync(p) } catch {}
    }
    paths.length = 0
  })

  it('creates a new encrypted database when no file exists', () => {
    const p = newPath()
    const db = openDatabase({ filePath: p, key: KEY })
    expect(db).toBeDefined()
    db.close()
    expect(fs.existsSync(p)).toBe(true)
  })

  it('round-trips data through an encrypted database', () => {
    const p = newPath()
    const db = openDatabase({ filePath: p, key: KEY })
    db.exec('CREATE TABLE t (id INTEGER PRIMARY KEY, val TEXT)')
    db.prepare("INSERT INTO t VALUES (1, 'hello')").run()
    db.close()

    const db2 = openDatabase({ filePath: p, key: KEY })
    const row = db2.prepare('SELECT val FROM t WHERE id = 1').get() as { val: string }
    expect(row.val).toBe('hello')
    db2.close()
  })

  it('rejects wrong key', () => {
    const p = newPath()
    const db = openDatabase({ filePath: p, key: KEY })
    db.exec('CREATE TABLE t (id INTEGER PRIMARY KEY)')
    db.close()

    const wrongKey = Buffer.from('f'.repeat(64), 'hex')
    // The wrong key will fail to decrypt → openDatabase throws or the probe fails
    // We don't get a migration attempt because the probe itself throws
    // Note: SQLCipher with wrong key throws on sqlite_master read
    // But openDatabase re-tries as plaintext migration which would also fail
    // This test verifies the wrong key causes an error
    expect(() => {
      const db2 = openDatabase({ filePath: p, key: wrongKey })
      db2.close()
    }).toThrow()
  })

  it('migrates a plaintext database to encrypted on first open', () => {
    const p = newPath()
    // Create a plaintext database
    const plain = new Database(p)
    plain.exec('CREATE TABLE t (id INTEGER PRIMARY KEY, val TEXT)')
    plain.prepare("INSERT INTO t VALUES (1, 'migrated')").run()
    plain.close()

    // Open with a key — should trigger migration
    const db = openDatabase({ filePath: p, key: KEY })
    const row = db.prepare('SELECT val FROM t WHERE id = 1').get() as { val: string }
    expect(row.val).toBe('migrated')
    db.close()

    // Verify file is now encrypted (opening without key should fail probe)
    const bare = new Database(p)
    expect(() => {
      bare.prepare('SELECT count(*) FROM sqlite_master').get()
    }).toThrow()
    bare.close()
  })

  it('opens plaintext database when no key provided', () => {
    const p = newPath()
    const plain = new Database(p)
    plain.exec('CREATE TABLE t (id INTEGER PRIMARY KEY)')
    plain.close()

    const db = openDatabase({ filePath: p, key: null })
    expect(db).toBeDefined()
    db.close()
  })

  it('throws when no key but database is encrypted', () => {
    const p = newPath()
    const db = openDatabase({ filePath: p, key: KEY })
    db.exec('CREATE TABLE t (id INTEGER PRIMARY KEY)')
    db.close()

    expect(() => openDatabase({ filePath: p, key: null })).toThrow('Database appears to be encrypted')
  })
})
