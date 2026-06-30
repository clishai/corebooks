import Database from 'better-sqlite3-multiple-ciphers'

type Db = InstanceType<typeof Database>

export interface OpenDatabaseArgs {
  filePath: string
  key: Buffer | null // null = open as plaintext (migration paths only)
}

export function openDatabase({ filePath, key }: OpenDatabaseArgs): Db {
  if (!key || key.length === 0) {
    const db = new Database(filePath)
    db.defaultSafeIntegers(true)
    try {
      db.prepare('SELECT count(*) FROM sqlite_master').get()
    } catch {
      db.close()
      throw new Error(
        'Database appears to be encrypted but no key is available. ' +
        'Please open the vault with your password.',
      )
    }
    return db
  }

  const hex = key.toString('hex') // JS strings are immutable; hex cannot be zeroed — keep lifetime minimal
  const db = new Database(filePath)
  db.pragma(`key = "x'${hex}'"`)
  db.defaultSafeIntegers(true)

  try {
    db.prepare('SELECT count(*) FROM sqlite_master').get()
    return db
  } catch {
    db.close()
    // Plaintext database that needs encrypting in place.
    try {
      migrateToSqlCipher(filePath, hex)
    } catch (migErr) {
      throw new Error(`Database migration to SQLCipher failed: ${(migErr as Error).message}`)
    }
    return openEncrypted(filePath, hex)
  }
}

function openEncrypted(filePath: string, hex: string): Db {
  const db = new Database(filePath)
  db.pragma(`key = "x'${hex}'"`)
  db.defaultSafeIntegers(true)
  try {
    db.prepare('SELECT count(*) FROM sqlite_master').get()
  } catch (err) {
    db.close()
    throw err
  }
  return db
}

/**
 * Migrate a plaintext SQLite database to SQLCipher encryption in-place.
 *
 * WHY this approach:
 * `sqlcipher_export` is not exposed as a SQL function in
 * `better-sqlite3-multiple-ciphers`. The correct migration path is:
 *
 * 1. Open the plaintext file without a key (so the SQLCipher driver sees it
 *    as an unencrypted database).
 * 2. Apply `PRAGMA rekey` — this is valid because `PRAGMA rekey` encrypts
 *    a database that is currently open in plaintext mode. It is only invalid
 *    when applied to a connection that already has a `key` set (which would
 *    attempt to re-encrypt an already-encrypted file). Opening without a key
 *    first avoids that error.
 * 3. Close the connection; the file is now encrypted on disk.
 *
 * The original code incorrectly tried to apply `PRAGMA rekey` to a
 * connection that had already been opened with `PRAGMA key`, which only
 * works for already-encrypted files.
 */
function migrateToSqlCipher(filePath: string, hex: string): void {
  const plain = new Database(filePath)
  try {
    plain.pragma(`rekey = "x'${hex}'"`)
  } finally {
    plain.close()
  }
}
