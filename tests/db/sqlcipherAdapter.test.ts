/**
 * Tests for SqlCipherAdapterFactory.
 *
 * We use an in-memory better-sqlite3-multiple-ciphers database so these tests
 * run without touching the filesystem or requiring an actual encryption key.
 * They verify that the adapter correctly delegates to the pre-opened Database
 * instance and that queryRaw / executeRaw / transactions all behave as the
 * Prisma SqlDriverAdapter interface requires.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3-multiple-ciphers'
import { SqlCipherAdapterFactory } from '../../src/db/sqlcipherAdapter'

describe('SqlCipherAdapterFactory', () => {
  let db: InstanceType<typeof Database>

  beforeEach(() => {
    db = new Database(':memory:')
    db.defaultSafeIntegers(true)
    db.exec('CREATE TABLE test (id INTEGER PRIMARY KEY, name TEXT, amount REAL)')
    db.exec("INSERT INTO test VALUES (1, 'Alice', 10.5)")
  })

  afterEach(() => {
    db.close()
  })

  it('accepts a pre-opened Database instance and connects', async () => {
    const factory = new SqlCipherAdapterFactory({ url: ':memory:' }, db)
    const adapter = await factory.connect()
    expect(adapter).toBeDefined()
    expect(adapter.provider).toBe('sqlite')
  })

  it('queryRaw returns rows from the pre-opened db', async () => {
    const factory = new SqlCipherAdapterFactory({ url: ':memory:' }, db)
    const adapter = await factory.connect()

    const result = await adapter.queryRaw({
      sql: 'SELECT id, name, amount FROM test',
      args: [],
      argTypes: [],
    })

    expect(result.columnNames).toEqual(['id', 'name', 'amount'])
    expect(result.rows).toHaveLength(1)
    expect(result.rows[0][1]).toBe('Alice')
  })

  it('executeRaw returns affected row count', async () => {
    const factory = new SqlCipherAdapterFactory({ url: ':memory:' }, db)
    const adapter = await factory.connect()

    const count = await adapter.executeRaw({
      sql: "INSERT INTO test VALUES (2, 'Bob', 20.0)",
      args: [],
      argTypes: [],
    })

    expect(count).toBe(1)
  })

  it('startTransaction, execute inside, and commit', async () => {
    const factory = new SqlCipherAdapterFactory({ url: ':memory:' }, db)
    const adapter = await factory.connect()

    const tx = await adapter.startTransaction()
    await tx.executeRaw({
      sql: "INSERT INTO test VALUES (3, 'Carol', 30.0)",
      args: [],
      argTypes: [],
    })
    await tx.commit()

    const rows = db.prepare('SELECT count(*) as n FROM test').get() as { n: number | bigint }
    expect(Number(rows.n)).toBe(2)
  })

  it('startTransaction and rollback discards changes', async () => {
    // Note: tx.rollback() only releases the mutex lock (matching the official
    // @prisma/adapter-better-sqlite3 behaviour). Prisma itself issues the
    // ROLLBACK SQL via executeRaw before calling rollback(). We replicate that
    // here to correctly test the rollback flow.
    const factory = new SqlCipherAdapterFactory({ url: ':memory:' }, db)
    const adapter = await factory.connect()

    const tx = await adapter.startTransaction()
    await tx.executeRaw({
      sql: "INSERT INTO test VALUES (4, 'Dave', 40.0)",
      args: [],
      argTypes: [],
    })
    // Prisma issues ROLLBACK SQL before calling tx.rollback()
    await tx.executeRaw({ sql: 'ROLLBACK', args: [], argTypes: [] })
    await tx.rollback()

    const rows = db.prepare('SELECT count(*) as n FROM test').get() as { n: number | bigint }
    expect(Number(rows.n)).toBe(1)
  })

  it('provider and adapterName are correct', async () => {
    const factory = new SqlCipherAdapterFactory({ url: ':memory:' }, db)
    const adapter = await factory.connect()
    expect(adapter.provider).toBe('sqlite')
    expect(adapter.adapterName).toBe('@corebooks/sqlcipher-adapter')
  })

  it('getConnectionInfo returns an object', async () => {
    const factory = new SqlCipherAdapterFactory({ url: ':memory:' }, db)
    const adapter = await factory.connect()
    const info = adapter.getConnectionInfo()
    expect(info).toBeDefined()
  })

  it('executeScript runs multiple statements', async () => {
    const factory = new SqlCipherAdapterFactory({ url: ':memory:' }, db)
    const adapter = await factory.connect()
    await adapter.executeScript(
      "INSERT INTO test VALUES (5, 'Eve', 50.0); INSERT INTO test VALUES (6, 'Frank', 60.0);"
    )
    const rows = db.prepare('SELECT count(*) as n FROM test').get() as { n: number | bigint }
    expect(Number(rows.n)).toBe(3)
  })

  it('startTransaction rejects non-SERIALIZABLE isolation levels', async () => {
    const factory = new SqlCipherAdapterFactory({ url: ':memory:' }, db)
    const adapter = await factory.connect()
    await expect(adapter.startTransaction('READ COMMITTED')).rejects.toThrow()
  })
})
