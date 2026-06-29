import Database from 'better-sqlite3-multiple-ciphers'

type Db = InstanceType<typeof Database>

export function openDatabase(filePath: string, key: string): Db {
  if (!key) {
    // No key — open plaintext (non-password vault or safeStorage unavailable)
    const db = new Database(filePath)
    db.defaultSafeIntegers(true)
    // Verify the file is actually plaintext (not encrypted with a missing key)
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

  // Apply SQLCipher key
  const db = new Database(filePath)
  db.pragma(`key = "x'${key}'"`)
  db.defaultSafeIntegers(true)

  try {
    db.prepare('SELECT count(*) FROM sqlite_master').get()
    return db // Key correct — already encrypted or new file
  } catch {
    // Key failed — database is plaintext; migrate it in-place using PRAGMA rekey.
    // Open without a key (plaintext), then rekey to encrypt the file.
    db.close()
    migrateToSqlCipher(filePath, key)
    // Re-open with key after migration
    const encrypted = new Database(filePath)
    encrypted.pragma(`key = "x'${key}'"`)
    encrypted.defaultSafeIntegers(true)
    encrypted.prepare('SELECT count(*) FROM sqlite_master').get() // must succeed now
    return encrypted
  }
}

/**
 * Encrypt a plaintext SQLite database in-place using PRAGMA rekey.
 *
 * WHY rekey instead of sqlcipher_export:
 * `better-sqlite3-multiple-ciphers` does not expose the `sqlcipher_export()`
 * SQL function. `PRAGMA rekey` achieves the same result — it re-encrypts the
 * database file in-place and is the recommended migration path when
 * `sqlcipher_export` is unavailable.
 */
function migrateToSqlCipher(filePath: string, key: string): void {
  const plain = new Database(filePath)
  try {
    plain.pragma(`rekey = "x'${key}'"`)
  } finally {
    plain.close()
  }
}
