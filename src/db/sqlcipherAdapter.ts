/**
 * SqlCipherAdapterFactory — custom Prisma driver adapter for SQLCipher.
 *
 * WHY this file exists:
 * The official `@prisma/adapter-better-sqlite3` creates its own `better-sqlite3`
 * Database instance internally and does not expose a way to pass a pre-opened
 * instance. SQLCipher encryption requires running `PRAGMA key` before any other
 * statement, which means we must open the database ourselves (via
 * `better-sqlite3-multiple-ciphers`) and hand it to Prisma.
 *
 * This file is a faithful TypeScript reimplementation of the official adapter
 * that accepts an optional pre-opened Database instance. When no instance is
 * provided it opens a plain (unencrypted) database, so the factory can also
 * replace the official adapter in dev/test scenarios.
 *
 * Interface contracts come from `@prisma/driver-adapter-utils`:
 *   - SqlDriverAdapterFactory   → connect(): Promise<SqlDriverAdapter>
 *   - SqlDriverAdapter extends SqlQueryable:
 *       queryRaw(q)    → Promise<SqlResultSet>
 *       executeRaw(q)  → Promise<number>          (affected-row count)
 *       executeScript  → Promise<void>
 *       startTransaction(isolationLevel?) → Promise<Transaction>
 *       getConnectionInfo?() → ConnectionInfo
 *       dispose()      → Promise<void>
 *   - Transaction extends SqlQueryable:
 *       commit()   → Promise<void>
 *       rollback() → Promise<void>
 */

import { Mutex } from 'async-mutex'
import {
  ColumnTypeEnum,
  DriverAdapterError,
  type ColumnType,
  type ConnectionInfo,
  type IsolationLevel,
  type MappedError,
  type SqlDriverAdapter,
  type SqlDriverAdapterFactory,
  type SqlQuery,
  type SqlResultSet,
  type Transaction,
  type TransactionOptions,
} from '@prisma/driver-adapter-utils'

// We use a type-only import so there is no runtime require of the package at
// the module level. The package may not be present in all build contexts
// (e.g., the Vite/browser bundle). The actual require() happens only inside
// SqlCipherAdapterFactory when connect() is called.
import type BetterSQLite3Ctor from 'better-sqlite3-multiple-ciphers'
type Db = InstanceType<typeof BetterSQLite3Ctor>
type Statement = ReturnType<Db['prepare']>
type ColumnInfo = ReturnType<Statement['columns']>[number]

// ---------------------------------------------------------------------------
// Type mapping — mirrors the official adapter's conversion.ts
// ---------------------------------------------------------------------------

function mapDeclType(declType: string | null): ColumnType | null {
  if (declType === null || declType === '') return null
  switch (declType.toUpperCase()) {
    case 'DECIMAL':
      return ColumnTypeEnum.Numeric
    case 'FLOAT':
      return ColumnTypeEnum.Float
    case 'DOUBLE':
    case 'DOUBLE PRECISION':
    case 'NUMERIC':
    case 'REAL':
      return ColumnTypeEnum.Double
    case 'TINYINT':
    case 'SMALLINT':
    case 'MEDIUMINT':
    case 'INT':
    case 'INTEGER':
    case 'SERIAL':
    case 'INT2':
      return ColumnTypeEnum.Int32
    case 'BIGINT':
    case 'UNSIGNED BIG INT':
    case 'INT8':
      return ColumnTypeEnum.Int64
    case 'DATETIME':
    case 'TIMESTAMP':
      return ColumnTypeEnum.DateTime
    case 'TIME':
      return ColumnTypeEnum.Time
    case 'DATE':
      return ColumnTypeEnum.Date
    case 'TEXT':
    case 'CLOB':
    case 'CHARACTER':
    case 'VARCHAR':
    case 'VARYING CHARACTER':
    case 'NCHAR':
    case 'NATIVE CHARACTER':
    case 'NVARCHAR':
      return ColumnTypeEnum.Text
    case 'BLOB':
      return ColumnTypeEnum.Bytes
    case 'BOOLEAN':
      return ColumnTypeEnum.Boolean
    case 'JSONB':
      return ColumnTypeEnum.Json
    default:
      return null
  }
}

function inferColumnType(value: unknown): ColumnType {
  switch (typeof value) {
    case 'string':
      return ColumnTypeEnum.Text
    case 'bigint':
      return ColumnTypeEnum.Int64
    case 'boolean':
      return ColumnTypeEnum.Boolean
    case 'number':
      return ColumnTypeEnum.UnknownNumber
    case 'object':
      if (value instanceof ArrayBuffer) return ColumnTypeEnum.Bytes
      throw new Error(`unexpected value of type object: ${JSON.stringify(value)}`)
    default:
      throw new Error(`unexpected value of type ${typeof value}: ${String(value)}`)
  }
}

function getColumnTypes(declaredTypes: (string | null)[], rows: unknown[][]): ColumnType[] {
  const emptyIndices = new Set<number>()
  const result: (ColumnType | null)[] = declaredTypes.map((t, i) => {
    const mapped = mapDeclType(t)
    if (mapped === null) emptyIndices.add(i)
    return mapped
  })

  if (emptyIndices.size === 0) return result as ColumnType[]

  columnLoop: for (const colIdx of emptyIndices) {
    for (let rowIdx = 0; rowIdx < rows.length; rowIdx++) {
      const candidate = rows[rowIdx][colIdx]
      if (candidate !== null) {
        result[colIdx] = inferColumnType(candidate)
        continue columnLoop
      }
    }
    result[colIdx] = ColumnTypeEnum.Int32
  }
  return result as ColumnType[]
}

function mapRow(row: unknown[], columnTypes: ColumnType[]): unknown[] {
  return row.map((value, i) => {
    if (
      typeof value === 'number' &&
      (columnTypes[i] === ColumnTypeEnum.Int32 || columnTypes[i] === ColumnTypeEnum.Int64) &&
      !Number.isInteger(value)
    ) {
      return Math.trunc(value)
    }
    if (
      (typeof value === 'number' || typeof value === 'bigint') &&
      columnTypes[i] === ColumnTypeEnum.DateTime
    ) {
      return new Date(Number(value)).toISOString()
    }
    if (typeof value === 'bigint') {
      const asNumber = Number(value)
      return Number.isSafeInteger(asNumber) ? asNumber : value.toString()
    }
    return value
  })
}

function mapArg(arg: unknown, argType: { scalarType: string }): unknown {
  if (arg === null) return null
  if (typeof arg === 'string' && argType.scalarType === 'int') return Number.parseInt(arg)
  if (typeof arg === 'string' && argType.scalarType === 'float') return Number.parseFloat(arg)
  if (typeof arg === 'string' && argType.scalarType === 'decimal') return Number.parseFloat(arg)
  if (typeof arg === 'string' && argType.scalarType === 'bigint') return BigInt(arg)
  if (typeof arg === 'boolean') return arg ? 1 : 0
  if (typeof arg === 'string' && argType.scalarType === 'datetime') {
    // Prisma sends datetime as ISO string; SQLite stores as ISO with offset
    const d = new Date(arg)
    return d.toISOString().replace('Z', '+00:00')
  }
  if (typeof arg === 'string' && argType.scalarType === 'bytes') {
    return Buffer.from(arg, 'base64')
  }
  return arg
}

function mapSqliteError(code: string, message: string): MappedError | null {
  switch (code) {
    case 'SQLITE_BUSY':
      return { kind: 'SocketTimeout' }
    case 'SQLITE_CONSTRAINT_UNIQUE':
    case 'SQLITE_CONSTRAINT_PRIMARYKEY': {
      const fields = message.split('constraint failed: ').at(1)?.split(', ').map(f => f.split('.').pop() as string)
      return { kind: 'UniqueConstraintViolation', constraint: fields ? { fields } : undefined }
    }
    case 'SQLITE_CONSTRAINT_NOTNULL': {
      const fields = message.split('constraint failed: ').at(1)?.split(', ').map(f => f.split('.').pop() as string)
      return { kind: 'NullConstraintViolation', constraint: fields ? { fields } : undefined }
    }
    case 'SQLITE_CONSTRAINT_FOREIGNKEY':
    case 'SQLITE_CONSTRAINT_TRIGGER':
      return { kind: 'ForeignKeyConstraintViolation', constraint: { foreignKey: {} } }
    default:
      if (message.startsWith('no such table')) {
        return { kind: 'TableDoesNotExist', table: message.split(': ').at(1) }
      }
      if (message.startsWith('no such column')) {
        return { kind: 'ColumnNotFound', column: message.split(': ').at(1) }
      }
      if (message.includes('has no column named ')) {
        return { kind: 'ColumnNotFound', column: message.split('has no column named ').at(1) }
      }
      return null
  }
}

function convertError(error: unknown): never {
  const e = error as { code?: string; message?: string }
  if (typeof e.code === 'string' && typeof e.message === 'string') {
    const mapped = mapSqliteError(e.code, e.message)
    if (mapped !== null) {
      throw new DriverAdapterError({
        ...mapped,
        originalCode: e.code,
        originalMessage: e.message,
      } as MappedError & { originalCode?: string; originalMessage?: string })
    }
  }
  throw error
}

// ---------------------------------------------------------------------------
// Queryable base — shared by adapter and transaction
// ---------------------------------------------------------------------------

abstract class SqlCipherQueryable {
  readonly provider = 'sqlite' as const
  readonly adapterName = '@corebooks/sqlcipher-adapter' as const

  constructor(protected readonly db: Db) {}

  async queryRaw(query: SqlQuery): Promise<SqlResultSet> {
    try {
      const args = query.args.map((arg, i) => mapArg(arg, query.argTypes[i] ?? { scalarType: 'unknown' }))
      const stmt = this.db.prepare(query.sql).bind(args)

      if (!stmt.reader) {
        stmt.run()
        return { columnNames: [], columnTypes: [], rows: [] }
      }

      const columns: ColumnInfo[] = stmt.columns()
      const declaredTypes = columns.map(c => c.type)
      const columnNames = columns.map(c => c.name)
      const values: unknown[][] = stmt.raw().all() as unknown[][]
      const columnTypes = getColumnTypes(declaredTypes, values)
      return {
        columnNames,
        columnTypes,
        rows: values.map(row => mapRow(row, columnTypes)),
      }
    } catch (e) {
      throw convertError(e)
    }
  }

  async executeRaw(query: SqlQuery): Promise<number> {
    try {
      const args = query.args.map((arg, i) => mapArg(arg, query.argTypes[i] ?? { scalarType: 'unknown' }))
      const stmt = this.db.prepare(query.sql).bind(args)
      const result = stmt.run()
      return result.changes
    } catch (e) {
      throw convertError(e)
    }
  }
}

// ---------------------------------------------------------------------------
// Transaction
// ---------------------------------------------------------------------------

class SqlCipherTransaction extends SqlCipherQueryable implements Transaction {
  readonly options: TransactionOptions

  constructor(db: Db, options: TransactionOptions, private readonly unlockParent: () => void) {
    super(db)
    this.options = options
  }

  commit(): Promise<void> {
    this.unlockParent()
    return Promise.resolve()
  }

  rollback(): Promise<void> {
    this.unlockParent()
    return Promise.resolve()
  }

  async createSavepoint(name: string): Promise<void> {
    await this.executeRaw({ sql: `SAVEPOINT ${name}`, args: [], argTypes: [] })
  }

  async rollbackToSavepoint(name: string): Promise<void> {
    await this.executeRaw({ sql: `ROLLBACK TO ${name}`, args: [], argTypes: [] })
  }

  async releaseSavepoint(name: string): Promise<void> {
    await this.executeRaw({ sql: `RELEASE SAVEPOINT ${name}`, args: [], argTypes: [] })
  }
}

// ---------------------------------------------------------------------------
// Adapter
// ---------------------------------------------------------------------------

class SqlCipherAdapter extends SqlCipherQueryable implements SqlDriverAdapter {
  readonly #mutex = new Mutex()

  constructor(db: Db) {
    super(db)
  }

  getConnectionInfo(): ConnectionInfo {
    return { schemaName: undefined, supportsRelationJoins: false }
  }

  executeScript(script: string): Promise<void> {
    try {
      this.db.exec(script)
    } catch (e) {
      throw convertError(e)
    }
    return Promise.resolve()
  }

  async startTransaction(isolationLevel?: IsolationLevel): Promise<Transaction> {
    // SQLite only supports SERIALIZABLE; reject anything else
    if (isolationLevel && isolationLevel !== 'SERIALIZABLE') {
      throw new DriverAdapterError({ kind: 'InvalidIsolationLevel', level: isolationLevel })
    }
    const options: TransactionOptions = { usePhantomQuery: false }
    const release = await this.#mutex.acquire()
    try {
      this.db.prepare('BEGIN').run()
      return new SqlCipherTransaction(this.db, options, release)
    } catch (e) {
      release()
      throw convertError(e)
    }
  }

  dispose(): Promise<void> {
    this.db.close()
    return Promise.resolve()
  }
}

// ---------------------------------------------------------------------------
// Factory — the public export
// ---------------------------------------------------------------------------

/**
 * SqlCipherAdapterFactory implements `SqlDriverAdapterFactory` (and by
 * extension `SqlMigrationAwareDriverAdapterFactory` via `connectToShadowDb`).
 *
 * Pass a pre-opened `better-sqlite3-multiple-ciphers` Database instance to
 * use an encrypted database. Omit `db` to open a plain database from `url`.
 *
 * Usage:
 *   const raw = openDatabase(filePath, key)   // applies PRAGMA key
 *   const factory = new SqlCipherAdapterFactory({ url: filePath }, raw)
 *   const prisma = new PrismaClient({ adapter: factory })
 */
export class SqlCipherAdapterFactory implements SqlDriverAdapterFactory {
  readonly provider = 'sqlite' as const
  readonly adapterName = '@corebooks/sqlcipher-adapter' as const

  readonly #url: string
  readonly #db: Db | undefined

  constructor(config: { url: string }, db?: Db) {
    this.#url = config.url
    this.#db = db
  }

  connect(): Promise<SqlCipherAdapter> {
    const db = this.#db ?? this.#openFresh(this.#url)
    db.defaultSafeIntegers(true)
    return Promise.resolve(new SqlCipherAdapter(db))
  }

  /** Used by Prisma migrate for shadow-database operations. */
  connectToShadowDb(): Promise<SqlCipherAdapter> {
    // Shadow DB is always plain (unencrypted, in-memory or at a temp path).
    // We never pass the encryption key here — shadow databases are ephemeral.
    const db = this.#openFresh(':memory:')
    db.defaultSafeIntegers(true)
    return Promise.resolve(new SqlCipherAdapter(db))
  }

  #openFresh(url: string): Db {
    // Dynamic require so this module does not break in browser/Vite bundles
    // where better-sqlite3-multiple-ciphers is not available.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Database = require('better-sqlite3-multiple-ciphers') as typeof BetterSQLite3Ctor
    return new Database(url)
  }
}
