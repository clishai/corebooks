# Plan F — SQLCipher Full Database Encryption Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Encrypt every vault's `corebooks.db` at rest using SQLCipher, keyed by the vault key K from Plan E, with a password-prompt modal for password-protected vaults.

**Architecture:** Vault key K (already in OS keychain as `COREBOOKS_DB_KEY`) is used as the SQLCipher raw key. `setupEncryption` wraps `COREBOOKS_DB_KEY` (not new random bytes) so K_os = K_vault always — no re-encryption ever needed. A patched TypeScript Prisma adapter accepts a pre-opened SQLCipher Database instance. Password-protected vaults show `UnlockVaultModal` over the vault picker; non-password vaults open silently.

**Tech Stack:** `better-sqlite3-multiple-ciphers` (SQLCipher-enabled drop-in for better-sqlite3), `async-mutex` (transaction serialization), `@prisma/driver-adapter-utils` (adapter interface types), React + Tailwind (UI modal).

---

## File structure

| File | Action |
|---|---|
| `src/db/sqlcipherAdapter.ts` | New — TypeScript Prisma adapter backed by better-sqlite3-multiple-ciphers |
| `src/db/openDatabase.ts` | New — PRAGMA key application + plaintext migration |
| `src/db/client.ts` | Modify — swap adapter, call openDatabase |
| `src/db/ensureSchema.ts` | Modify — accept `Database` instance instead of file path |
| `src/api/bootstrap.ts` | Modify — pass keyed db to ensureSchema |
| `src/electron/main.ts` | Modify — K_os guard, vault:select needsPassword, vault:unlock IPC, setupEncryption uses K_os, resetPasswordAfterRecovery updates keychain |
| `src/electron/preload.ts` | Modify — expose vault.unlock |
| `src/ui/electron.d.ts` | Modify — type vault.unlock, update vault.select return |
| `src/ui/components/UnlockVaultModal.tsx` | New — password modal over vault picker |
| `src/ui/pages/VaultPickerPage.tsx` | Modify — show UnlockVaultModal on needsPassword |
| `package.json` | Modify — add deps + asarUnpack |

---

### Task 1: Install packages and update build config

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install runtime dependencies**

```bash
cd /Users/bradyfdavidson/Projects/corebooks
npm install better-sqlite3-multiple-ciphers async-mutex
```

Expected: both packages appear in `node_modules/`. `better-sqlite3-multiple-ciphers` is a native module — verify the version is ≥ 11.x (API-compatible with better-sqlite3 12.x used in this project) by running `npm list better-sqlite3-multiple-ciphers`.

- [ ] **Step 2: Add asarUnpack for native module**

Open `package.json`. Find the `"build"` → `"asarUnpack"` array. Add the new native module:

```json
"asarUnpack": [
  "node_modules/better-sqlite3/**",
  "node_modules/@prisma/adapter-better-sqlite3/**",
  "node_modules/better-sqlite3-multiple-ciphers/**"
]
```

- [ ] **Step 3: Verify import works**

```bash
node -e "const Database = require('better-sqlite3-multiple-ciphers'); const db = new Database(':memory:'); db.pragma(\"key = \\\"x'aabbccdd'\\\"\"); console.log('ok')"
```

Expected output: `ok` (no errors).

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add better-sqlite3-multiple-ciphers and async-mutex for SQLCipher"
```

---

### Task 2: Create `src/db/sqlcipherAdapter.ts`

**Files:**
- Create: `src/db/sqlcipherAdapter.ts`
- Test: `tests/db/sqlcipherAdapter.test.ts`

This is a clean TypeScript reimplementation of `@prisma/adapter-better-sqlite3` that uses `better-sqlite3-multiple-ciphers` and accepts a pre-opened Database instance.

- [ ] **Step 1: Write the failing test**

Create `tests/db/sqlcipherAdapter.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import Database from 'better-sqlite3-multiple-ciphers'
import { SqlCipherAdapterFactory } from '../../src/db/sqlcipherAdapter.js'

describe('SqlCipherAdapterFactory', () => {
  it('accepts a pre-opened database instance', async () => {
    const db = new Database(':memory:')
    db.defaultSafeIntegers(true)
    const factory = new SqlCipherAdapterFactory({ url: ':memory:' }, undefined, db)
    const adapter = await factory.connect()
    expect(adapter).toBeDefined()
    expect(adapter.provider).toBe('sqlite')
    await adapter.dispose()
  })

  it('can execute a query through the adapter', async () => {
    const db = new Database(':memory:')
    db.defaultSafeIntegers(true)
    db.exec('CREATE TABLE t (id INTEGER PRIMARY KEY, val TEXT)')
    db.exec("INSERT INTO t VALUES (1, 'hello')")
    const factory = new SqlCipherAdapterFactory({ url: ':memory:' }, undefined, db)
    const adapter = await factory.connect()
    const result = await adapter.queryRaw({
      sql: 'SELECT id, val FROM t',
      args: [],
      argTypes: [],
    })
    expect(result.columnNames).toEqual(['id', 'val'])
    expect(result.rows).toHaveLength(1)
    await adapter.dispose()
  })
})
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
npx vitest run tests/db/sqlcipherAdapter.test.ts
```

Expected: FAIL — `SqlCipherAdapterFactory` not found.

- [ ] **Step 3: Write the adapter**

Create `src/db/sqlcipherAdapter.ts`:

```typescript
// Patched copy of @prisma/adapter-better-sqlite3@7.8.0 logic, rewritten in TypeScript.
// Sole structural change: SqlCipherAdapterFactory constructor accepts an optional
// pre-opened Database instance (for SQLCipher PRAGMA key support).
// To upgrade: re-read node_modules/@prisma/adapter-better-sqlite3/dist/index.js,
// update the helper functions below, and re-apply the PATCH sections in the factory.
import Database from 'better-sqlite3-multiple-ciphers'
import { Mutex } from 'async-mutex'
import {
  ColumnTypeEnum,
  DriverAdapterError,
  Debug,
  type ArgType,
  type ColumnType,
  type IsolationLevel,
  type SqlDriverAdapter,
  type SqlMigrationAwareDriverAdapterFactory,
  type SqlQuery,
  type SqlResultSet,
  type Transaction,
  type TransactionOptions,
} from '@prisma/driver-adapter-utils'

type Db = InstanceType<typeof Database>
type Row = unknown[]

const debug = Debug('prisma:driver-adapter:better-sqlite3')
const ADAPTER_NAME = '@prisma/adapter-better-sqlite3' as const

// ── Column type inference (mirrors original adapter) ──────────────────────────

function mapDeclType(typeName: string | null | undefined): ColumnType | null {
  const upper = (typeName ?? '').toUpperCase()
  if (!upper) return null
  if (upper.includes('INT')) return ColumnTypeEnum.Int64
  if (upper.includes('DATETIME') || upper.includes('TIMESTAMP')) return ColumnTypeEnum.DateTime
  if (upper.includes('TIME')) return ColumnTypeEnum.Time
  if (upper.includes('DATE')) return ColumnTypeEnum.Date
  if (upper.includes('BOOL')) return ColumnTypeEnum.Boolean
  if (
    upper.includes('TEXT') ||
    upper.includes('CHAR') ||
    upper.includes('CLOB') ||
    upper.includes('VARCHAR')
  ) return ColumnTypeEnum.Text
  if (upper.includes('BLOB') || upper.includes('BINARY')) return ColumnTypeEnum.Bytes
  if (upper.includes('JSON')) return ColumnTypeEnum.Json
  return null
}

function inferColumnType(value: unknown): ColumnType {
  if (typeof value === 'string') return ColumnTypeEnum.Text
  if (typeof value === 'bigint') return ColumnTypeEnum.Int64
  if (typeof value === 'boolean') return ColumnTypeEnum.Boolean
  if (value instanceof Uint8Array) return ColumnTypeEnum.Bytes
  return ColumnTypeEnum.UnknownNumber
}

function getColumnTypes(declaredTypes: (string | null | undefined)[], rows: Row[]): ColumnType[] {
  const pending = new Set<number>()
  const types: ColumnType[] = declaredTypes.map((t, i) => {
    const mapped = mapDeclType(t)
    if (mapped === null) pending.add(i)
    return mapped ?? ColumnTypeEnum.Int32
  })
  for (const col of pending) {
    for (const row of rows) {
      const v = row[col]
      if (v !== null && v !== undefined) {
        types[col] = inferColumnType(v)
        break
      }
    }
  }
  return types
}

function mapRow(row: Row, columnTypes: ColumnType[]): unknown[] {
  return row.map((value, i) => {
    if (value === null || value === undefined) return value
    const t = columnTypes[i]
    if (
      typeof value === 'number' &&
      (t === ColumnTypeEnum.Int32 || t === ColumnTypeEnum.Int64) &&
      !Number.isInteger(value)
    ) return Math.trunc(value)
    if (
      (typeof value === 'number' || typeof value === 'bigint') &&
      t === ColumnTypeEnum.DateTime
    ) return new Date(Number(value)).toISOString()
    if (value instanceof Uint8Array) return Array.from(value)
    return value
  })
}

function mapArg(
  arg: unknown,
  argType: ArgType,
  options: Record<string, unknown> | undefined,
): unknown {
  if (arg === null || arg === undefined) return null
  if (argType.arity === 'list') {
    if (argType.scalarType === 'bytes') {
      return (arg as number[][]).map((v) => Buffer.from(v))
    }
    return arg
  }
  switch (argType.scalarType) {
    case 'bytes':
      return Buffer.from(arg as number[])
    case 'datetime': {
      const fmt = (options?.['timestampFormat'] as string | undefined) ?? 'iso8601'
      if (fmt === 'unix') {
        return typeof arg === 'string' ? new Date(arg).getTime() : Number(arg)
      }
      return typeof arg === 'string' ? arg : new Date(Number(arg)).toISOString()
    }
    case 'json':
      return typeof arg === 'string' ? arg : JSON.stringify(arg)
    default:
      return arg
  }
}

function makeDriveError(): { kind: 'GenericJs'; id: number } {
  return { kind: 'GenericJs', id: 0 }
}

// ── Queryable base ─────────────────────────────────────────────────────────────

abstract class BetterSQLite3Queryable {
  readonly provider = 'sqlite' as const
  readonly adapterName = ADAPTER_NAME

  constructor(
    protected readonly client: Db,
    protected readonly adapterOptions: Record<string, unknown> | undefined,
  ) {}

  async queryRaw(query: SqlQuery): Promise<SqlResultSet> {
    debug('[js::queryRaw] %O', query)
    try {
      const args = query.args.map((a, i) => mapArg(a, query.argTypes[i], this.adapterOptions))
      const stmt = this.client.prepare(query.sql).bind(args)
      if (!stmt.reader) {
        stmt.run()
        return { columnNames: [], columnTypes: [], rows: [] }
      }
      const columns = stmt.columns()
      const declaredTypes = columns.map((c) => c.type)
      const columnNames = columns.map((c) => c.name)
      const rawRows = stmt.raw().all() as Row[]
      const columnTypes = getColumnTypes(declaredTypes, rawRows)
      return {
        columnNames,
        columnTypes,
        rows: rawRows.map((row) => mapRow(row, columnTypes)),
      }
    } catch (e) {
      throw new DriverAdapterError(makeDriveError())
    }
  }

  async executeRaw(query: SqlQuery): Promise<number> {
    debug('[js::executeRaw] %O', query)
    try {
      const args = query.args.map((a, i) => mapArg(a, query.argTypes[i], this.adapterOptions))
      const stmt = this.client.prepare(query.sql).bind(args)
      const result = stmt.run()
      return result.changes
    } catch (e) {
      throw new DriverAdapterError(makeDriveError())
    }
  }
}

// ── Transaction ────────────────────────────────────────────────────────────────

class BetterSQLite3Transaction extends BetterSQLite3Queryable implements Transaction {
  readonly options: TransactionOptions = { usePhantomQuery: false }

  constructor(
    client: Db,
    adapterOptions: Record<string, unknown> | undefined,
    private readonly unlockParent: () => void,
  ) {
    super(client, adapterOptions)
  }

  commit(): Promise<void> {
    debug('[js::commit]')
    this.unlockParent()
    return Promise.resolve()
  }

  rollback(): Promise<void> {
    debug('[js::rollback]')
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

// ── Adapter ────────────────────────────────────────────────────────────────────

class PrismaSqlCipherAdapter extends BetterSQLite3Queryable implements SqlDriverAdapter {
  readonly #mutex = new Mutex()

  constructor(client: Db, adapterOptions: Record<string, unknown> | undefined) {
    super(client, adapterOptions)
  }

  executeScript(script: string): Promise<void> {
    try {
      this.client.exec(script)
    } catch (e) {
      throw new DriverAdapterError(makeDriveError())
    }
    return Promise.resolve()
  }

  async startTransaction(isolationLevel?: IsolationLevel): Promise<Transaction> {
    if (isolationLevel && isolationLevel !== 'SERIALIZABLE') {
      throw new DriverAdapterError({ kind: 'InvalidIsolationLevel', level: isolationLevel })
    }
    debug('[js::startTransaction]')
    const release = await this.#mutex.acquire()
    this.client.prepare('BEGIN').run()
    return new BetterSQLite3Transaction(this.client, this.adapterOptions, release)
  }

  dispose(): Promise<void> {
    this.client.close()
    return Promise.resolve()
  }
}

// ── Factory (exported) ─────────────────────────────────────────────────────────

export class SqlCipherAdapterFactory implements SqlMigrationAwareDriverAdapterFactory {
  readonly provider = 'sqlite' as const
  readonly adapterName = ADAPTER_NAME

  readonly #config: { url: string }
  readonly #options: Record<string, unknown> | undefined
  // PATCH: optional pre-opened database instance for SQLCipher support
  readonly #db: Db | undefined

  // PATCH: third param accepts pre-opened db
  constructor(
    config: { url: string },
    options?: Record<string, unknown>,
    db?: Db,
  ) {
    this.#config = config
    this.#options = options
    this.#db = db
  }

  connect(): Promise<SqlDriverAdapter> {
    // PATCH: use pre-opened db if provided, otherwise open fresh (no key applied)
    const client = this.#db ?? this.#openFresh(this.#config.url)
    return Promise.resolve(new PrismaSqlCipherAdapter(client, this.#options))
  }

  connectToShadowDb(): Promise<SqlDriverAdapter> {
    const url = (this.#options?.['shadowDatabaseUrl'] as string | undefined) ?? ':memory:'
    const client = this.#openFresh(url)
    return Promise.resolve(new PrismaSqlCipherAdapter(client, this.#options))
  }

  #openFresh(url: string): Db {
    const filePath = url.replace(/^file:/, '')
    const db = new Database(filePath)
    db.defaultSafeIntegers(true)
    return db
  }
}
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run tests/db/sqlcipherAdapter.test.ts
```

Expected: 2 passing.

- [ ] **Step 5: Type-check**

```bash
npx tsc --project tsconfig.json --noEmit
```

Expected: zero errors.

- [ ] **Step 6: Commit**

```bash
git add src/db/sqlcipherAdapter.ts tests/db/sqlcipherAdapter.test.ts
git commit -m "feat: add SqlCipherAdapterFactory — TypeScript Prisma adapter backed by SQLCipher"
```

---

### Task 3: Create `src/db/openDatabase.ts`

**Files:**
- Create: `src/db/openDatabase.ts`
- Test: `tests/db/openDatabase.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/db/openDatabase.test.ts`:

```typescript
import { describe, it, expect, afterEach } from 'vitest'
import Database from 'better-sqlite3-multiple-ciphers'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { openDatabase } from '../../src/db/openDatabase.js'

function tmpFile(): string {
  return path.join(os.tmpdir(), `cb_test_${Date.now()}_${Math.random().toString(36).slice(2)}.db`)
}

const files: string[] = []
function tracked(p: string): string { files.push(p); return p }
afterEach(() => { files.forEach((f) => { try { fs.unlinkSync(f) } catch {} }); files.length = 0 })

const KEY = 'a'.repeat(64) // 32-byte hex key

describe('openDatabase', () => {
  it('opens a new file and writes/reads with a key', () => {
    const p = tracked(tmpFile())
    const db = openDatabase(p, KEY)
    db.exec('CREATE TABLE t (x TEXT)')
    db.exec("INSERT INTO t VALUES ('hello')")
    db.close()

    const db2 = openDatabase(p, KEY)
    const row = db2.prepare('SELECT x FROM t').get() as { x: string }
    expect(row.x).toBe('hello')
    db2.close()
  })

  it('rejects the wrong key', () => {
    const p = tracked(tmpFile())
    const db = openDatabase(p, KEY)
    db.exec('CREATE TABLE t (x TEXT)')
    db.close()

    expect(() => openDatabase(p, 'b'.repeat(64))).toThrow()
  })

  it('migrates a plaintext database to SQLCipher', () => {
    const p = tracked(tmpFile())
    // Create plaintext DB
    const plain = new Database(p)
    plain.exec('CREATE TABLE t (x TEXT)')
    plain.exec("INSERT INTO t VALUES ('migrated')")
    plain.close()

    // openDatabase should detect plaintext and migrate
    const db = openDatabase(p, KEY)
    const row = db.prepare('SELECT x FROM t').get() as { x: string }
    expect(row.x).toBe('migrated')
    db.close()

    // Verify file is now encrypted (plaintext open fails)
    expect(() => {
      const plain2 = new Database(p)
      plain2.prepare('SELECT * FROM t').all()
      plain2.close()
    }).toThrow()
  })

  it('opens without a key when key is empty string', () => {
    const p = tracked(tmpFile())
    const db = openDatabase(p, '')
    db.exec('CREATE TABLE t (x TEXT)')
    db.close()
    expect(true).toBe(true) // no throw
  })
})
```

- [ ] **Step 2: Run to confirm failure**

```bash
npx vitest run tests/db/openDatabase.test.ts
```

Expected: FAIL — `openDatabase` not found.

- [ ] **Step 3: Implement `src/db/openDatabase.ts`**

```typescript
import Database from 'better-sqlite3-multiple-ciphers'
import fs from 'fs'

type Db = InstanceType<typeof Database>

export function openDatabase(filePath: string, key: string): Db {
  if (!key) {
    const db = new Database(filePath)
    db.defaultSafeIntegers(true)
    try {
      db.prepare('SELECT count(*) FROM sqlite_master').get()
    } catch {
      db.close()
      throw new Error(
        'Database is encrypted but no decryption key is available. ' +
        'Ensure your OS keychain is accessible or use vault recovery.',
      )
    }
    return db
  }

  // Open with key and probe
  const db = new Database(filePath)
  db.pragma(`key = "x'${key}'"`)
  db.defaultSafeIntegers(true)

  try {
    db.prepare('SELECT count(*) FROM sqlite_master').get()
    // Success — DB is correctly keyed (new file or already encrypted)
    return db
  } catch {
    // DB is plaintext — migrate in-place using sqlcipher_export
    db.close()
    migrateToSqlCipher(filePath, key)
    // Re-open as encrypted
    const enc = new Database(filePath)
    enc.pragma(`key = "x'${key}'"`)
    enc.defaultSafeIntegers(true)
    return enc
  }
}

function migrateToSqlCipher(filePath: string, key: string): void {
  const tmpPath = `${filePath}.tmp_enc`
  try { fs.unlinkSync(tmpPath) } catch { /* ok */ }

  const plain = new Database(filePath)
  plain.defaultSafeIntegers(true)
  try {
    plain.exec(`ATTACH DATABASE '${tmpPath}' AS encrypted KEY "x'${key}'"`)
    plain.exec("SELECT sqlcipher_export('encrypted')")
    plain.exec('DETACH DATABASE encrypted')
  } finally {
    plain.close()
  }

  // Atomic rename (POSIX); on Windows delete first then rename
  if (process.platform === 'win32') {
    fs.unlinkSync(filePath)
  }
  fs.renameSync(tmpPath, filePath)
}
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run tests/db/openDatabase.test.ts
```

Expected: 4 passing.

- [ ] **Step 5: Commit**

```bash
git add src/db/openDatabase.ts tests/db/openDatabase.test.ts
git commit -m "feat: add openDatabase — SQLCipher key application and plaintext migration"
```

---

### Task 4: Refactor `src/db/ensureSchema.ts`

**Files:**
- Modify: `src/db/ensureSchema.ts`

The function currently opens its own DB connection. It must accept the already-keyed instance instead.

- [ ] **Step 1: Write the updated file**

Replace the entire content of `src/db/ensureSchema.ts`:

```typescript
import type Database from 'better-sqlite3-multiple-ciphers'

type Db = InstanceType<typeof Database>

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS "Account" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "number" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "normalBalance" TEXT NOT NULL,
    "isContra" BOOLEAN NOT NULL DEFAULT false,
    "contraTo" TEXT,
    "classification" TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS "Account_number_key" ON "Account"("number");

CREATE TABLE IF NOT EXISTS "JournalEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "date" DATETIME NOT NULL,
    "memo" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "paymentMethod" TEXT,
    "reversalOf" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE TABLE IF NOT EXISTS "JournalLine" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "entryId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    CONSTRAINT "JournalLine_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "JournalEntry" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "JournalLine_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "RecurringTemplate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "memo" TEXT NOT NULL,
    "paymentMethod" TEXT,
    "schedule" TEXT NOT NULL,
    "customCron" TEXT,
    "nextDue" DATETIME NOT NULL,
    "autoPost" BOOLEAN NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "RecurringLine" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "templateId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    FOREIGN KEY ("templateId") REFERENCES "RecurringTemplate"("id") ON DELETE CASCADE,
    FOREIGN KEY ("accountId") REFERENCES "Account"("id")
);
`

export function ensureSchema(db: Db): void {
  db.exec(SCHEMA_SQL)

  const cols = (db.prepare('PRAGMA table_info(Account)').all() as { name: string }[]).map(
    (c) => c.name,
  )
  if (!cols.includes('classification')) {
    db.exec('ALTER TABLE "Account" ADD COLUMN "classification" TEXT')
  }

  db.exec(`CREATE TABLE IF NOT EXISTS "PeriodConfig" ("id" TEXT NOT NULL PRIMARY KEY DEFAULT 'singleton', "fiscalYearEndMonth" INTEGER NOT NULL DEFAULT 12, "fiscalYearEndDay" INTEGER NOT NULL DEFAULT 31, "closeFrequency" TEXT NOT NULL DEFAULT 'year-end', "retainedEarningsAcctId" TEXT)`)
  db.exec(`CREATE TABLE IF NOT EXISTS "ClosedPeriod" ("id" TEXT NOT NULL PRIMARY KEY, "year" INTEGER NOT NULL, "month" INTEGER NOT NULL, "closedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "entryId" TEXT NOT NULL)`)
  db.exec(`CREATE TABLE IF NOT EXISTS "User" ("id" TEXT NOT NULL PRIMARY KEY, "email" TEXT NOT NULL UNIQUE, "passwordHash" TEXT NOT NULL, "role" TEXT NOT NULL DEFAULT 'Viewer', "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)`)

  const entryCols = (db.prepare('PRAGMA table_info(JournalEntry)').all() as { name: string }[]).map(
    (c) => c.name,
  )
  if (!entryCols.includes('postedVia')) db.exec('ALTER TABLE "JournalEntry" ADD COLUMN "postedVia" TEXT')
  if (!entryCols.includes('sourceType')) db.exec('ALTER TABLE "JournalEntry" ADD COLUMN "sourceType" TEXT')
  if (!entryCols.includes('sourceId')) db.exec('ALTER TABLE "JournalEntry" ADD COLUMN "sourceId" TEXT')

  db.exec(`CREATE TABLE IF NOT EXISTS "AppSetting" ("key" TEXT NOT NULL PRIMARY KEY, "value" TEXT NOT NULL, "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)`)
  db.exec(`CREATE TABLE IF NOT EXISTS "AuditEvent" ("id" TEXT NOT NULL PRIMARY KEY, "action" TEXT NOT NULL, "entityType" TEXT NOT NULL, "entityId" TEXT, "detailJson" TEXT, "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)`)
  db.exec(`CREATE TABLE IF NOT EXISTS "BankRule" ("id" TEXT NOT NULL PRIMARY KEY, "name" TEXT NOT NULL, "priority" INTEGER NOT NULL DEFAULT 100, "enabled" BOOLEAN NOT NULL DEFAULT 1, "matchField" TEXT NOT NULL, "matchType" TEXT NOT NULL, "pattern" TEXT NOT NULL, "accountId" TEXT, "entryType" TEXT NOT NULL DEFAULT 'expense', "memo" TEXT, "paymentMethod" TEXT, "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)`)
  db.exec(`CREATE TABLE IF NOT EXISTS "ReconciliationSession" ("id" TEXT NOT NULL PRIMARY KEY, "accountId" TEXT NOT NULL, "statementDate" DATETIME NOT NULL, "endingBalance" INTEGER NOT NULL, "status" TEXT NOT NULL DEFAULT 'open', "notes" TEXT, "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)`)
  db.exec(`CREATE TABLE IF NOT EXISTS "ReconciliationItem" ("id" TEXT NOT NULL PRIMARY KEY, "sessionId" TEXT NOT NULL, "entryId" TEXT NOT NULL, "cleared" BOOLEAN NOT NULL DEFAULT 0, FOREIGN KEY ("sessionId") REFERENCES "ReconciliationSession"("id") ON DELETE CASCADE)`)
  db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS "ReconciliationItem_sessionId_entryId_key" ON "ReconciliationItem"("sessionId", "entryId")`)
  db.exec(`CREATE TABLE IF NOT EXISTS "PluginCategory" ("id" TEXT NOT NULL PRIMARY KEY, "name" TEXT NOT NULL, "description" TEXT NOT NULL, "permissions" TEXT NOT NULL, "enabled" BOOLEAN NOT NULL DEFAULT 0, "builtIn" BOOLEAN NOT NULL DEFAULT 1, "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)`)
}
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --project tsconfig.json --noEmit
```

Expected: zero errors (or only errors from files not yet updated — those are fixed in Task 5).

- [ ] **Step 3: Commit**

```bash
git add src/db/ensureSchema.ts
git commit -m "refactor: ensureSchema accepts pre-opened Database instance instead of file path"
```

---

### Task 5: Wire `src/db/client.ts` and `src/api/bootstrap.ts`

**Files:**
- Modify: `src/db/client.ts`
- Modify: `src/api/bootstrap.ts`

- [ ] **Step 1: Update `src/db/client.ts`**

Replace the entire file:

```typescript
import { PrismaClient } from '../generated/prisma/client.js'
import { SqlCipherAdapterFactory } from './sqlcipherAdapter.js'
import { openDatabase } from './openDatabase.js'

export function isPostgresUrl(rawUrl: string): boolean {
  return rawUrl.startsWith('postgresql://') || rawUrl.startsWith('postgres://')
}

export function postgresHasSSL(rawUrl: string): boolean {
  return (
    rawUrl.includes('sslmode=require') ||
    rawUrl.includes('sslmode=verify-full') ||
    rawUrl.includes('sslmode=verify-ca') ||
    rawUrl.includes('ssl=true')
  )
}

function checkPostgresSSL(rawUrl: string): void {
  if (!isPostgresUrl(rawUrl)) return
  if (!postgresHasSSL(rawUrl)) {
    process.stderr.write(
      '[corebooks] WARNING: PostgreSQL DATABASE_URL does not specify sslmode. ' +
      'Add ?sslmode=require to encrypt data in transit.\n',
    )
  }
}

function createPrismaClient(): PrismaClient {
  const rawUrl = process.env['DATABASE_URL'] ?? 'file:corebooks.db'
  checkPostgresSSL(rawUrl)

  if (isPostgresUrl(rawUrl)) {
    // PostgreSQL: no SQLCipher, use standard Prisma client
    return new PrismaClient()
  }

  const filePath = rawUrl.startsWith('file:') ? rawUrl.slice(5) : rawUrl
  const key = process.env['COREBOOKS_DB_KEY'] ?? ''
  const db = openDatabase(filePath, key)
  const adapter = new SqlCipherAdapterFactory({ url: filePath }, undefined, db)
  return new PrismaClient({ adapter })
}

let _client: PrismaClient | undefined
// Expose the keyed database so bootstrap.ts can pass it to ensureSchema.
let _db: ReturnType<typeof openDatabase> | undefined

export function getOpenDb(): ReturnType<typeof openDatabase> | undefined {
  return _db
}

export function getPrismaClient(): PrismaClient {
  if (!_client) {
    _client = createPrismaClient()
  }
  return _client
}

export async function disconnectPrisma(): Promise<void> {
  if (_client) {
    await _client.$disconnect()
    _client = undefined
    _db = undefined
  }
}
```

Wait — there's a problem. `createPrismaClient` calls `openDatabase` but we need `_db` to be set so `bootstrap.ts` can access it. Let me revise to expose `_db`:

```typescript
import { PrismaClient } from '../generated/prisma/client.js'
import { SqlCipherAdapterFactory } from './sqlcipherAdapter.js'
import { openDatabase } from './openDatabase.js'
import type Database from 'better-sqlite3-multiple-ciphers'

export function isPostgresUrl(rawUrl: string): boolean {
  return rawUrl.startsWith('postgresql://') || rawUrl.startsWith('postgres://')
}

export function postgresHasSSL(rawUrl: string): boolean {
  return (
    rawUrl.includes('sslmode=require') ||
    rawUrl.includes('sslmode=verify-full') ||
    rawUrl.includes('sslmode=verify-ca') ||
    rawUrl.includes('ssl=true')
  )
}

function checkPostgresSSL(rawUrl: string): void {
  if (!isPostgresUrl(rawUrl)) return
  if (!postgresHasSSL(rawUrl)) {
    process.stderr.write(
      '[corebooks] WARNING: PostgreSQL DATABASE_URL does not specify sslmode. ' +
      'Add ?sslmode=require to encrypt data in transit.\n',
    )
  }
}

let _client: PrismaClient | undefined
let _db: InstanceType<typeof Database> | undefined

function createPrismaClient(): PrismaClient {
  const rawUrl = process.env['DATABASE_URL'] ?? 'file:corebooks.db'
  checkPostgresSSL(rawUrl)

  if (isPostgresUrl(rawUrl)) {
    return new PrismaClient()
  }

  const filePath = rawUrl.startsWith('file:') ? rawUrl.slice(5) : rawUrl
  const key = process.env['COREBOOKS_DB_KEY'] ?? ''
  _db = openDatabase(filePath, key)
  const adapter = new SqlCipherAdapterFactory({ url: filePath }, undefined, _db)
  return new PrismaClient({ adapter })
}

export function getOpenDb(): InstanceType<typeof Database> | undefined {
  return _db
}

export function getPrismaClient(): PrismaClient {
  if (!_client) _client = createPrismaClient()
  return _client
}

export async function disconnectPrisma(): Promise<void> {
  if (_client) {
    await _client.$disconnect()
    _client = undefined
    _db = undefined
  }
}
```

- [ ] **Step 2: Update `src/api/bootstrap.ts`**

Replace the entire file:

```typescript
import 'dotenv/config'
import { Ledger } from '../core/engine/ledger.js'
import { loadLedger } from '../db/repositories/entryRepository.js'
import { listAccounts } from '../db/repositories/accountRepository.js'
import { disconnectPrisma, getPrismaClient, getOpenDb, isPostgresUrl } from '../db/client.js'
import { buildApp } from './server.js'
import { ensureSchema } from '../db/ensureSchema.js'

export let ledger: Ledger = new Ledger()

export async function startServer(port: number): Promise<void> {
  const rawUrl = process.env['DATABASE_URL'] ?? 'file:corebooks.db'

  if (!isPostgresUrl(rawUrl)) {
    // Initialize the Prisma client first — this calls openDatabase internally
    // and populates the module-level _db reference in client.ts.
    getPrismaClient()
    const db = getOpenDb()
    if (!db) throw new Error('Expected keyed database to be open')
    ensureSchema(db)
  }

  const [loadedLedger, chartOfAccounts] = await Promise.all([
    loadLedger(),
    listAccounts(),
  ])

  ledger = loadedLedger

  const app = buildApp({ ledger, chartOfAccounts }, { logger: false })

  try {
    await app.listen({ port, host: '127.0.0.1' })
  } catch (err) {
    await disconnectPrisma()
    throw err
  }
}
```

- [ ] **Step 3: Type-check**

```bash
npx tsc --project tsconfig.json --noEmit
```

Expected: zero errors.

- [ ] **Step 4: Commit**

```bash
git add src/db/client.ts src/api/bootstrap.ts
git commit -m "feat: wire SQLCipher adapter and openDatabase into Prisma client and bootstrap"
```

---

### Task 6: Update `src/electron/main.ts`

**Files:**
- Modify: `src/electron/main.ts`

Four changes:
1. `getOrCreateEncryptionKey` gains an "already set" guard (so vault:unlock's key isn't overwritten)
2. `setupEncryption` uses `COREBOOKS_DB_KEY` as the vault key (unifying K_os = K_vault)
3. `vault:select` returns `{ needsPassword: true }` for password-protected vaults instead of starting API
4. New `vault:unlock` IPC handler
5. `resetPasswordAfterRecovery` re-saves recovered key to OS keychain
6. Auto-open path skips password-protected vaults

- [ ] **Step 1: Guard `getOrCreateEncryptionKey` against overwriting an already-set key**

Find this function in `src/electron/main.ts` (starts around line 94). Add a guard at the top:

```typescript
function getOrCreateEncryptionKey(userData: string): void {
  if (process.env['COREBOOKS_DB_KEY']) return   // ADD THIS LINE — already set by vault:unlock or recovery

  if (!safeStorage.isEncryptionAvailable()) {
    return
  }
  // ... rest unchanged
```

- [ ] **Step 2: Modify `setupEncryption` to use K_os as vault key**

Find `ipcMain.handle('vault:setupEncryption', ...)` (around line 244). Change the `vaultKey` line from:

```typescript
const vaultKey = randomBytes(32)
```

To:

```typescript
const hexKey = process.env['COREBOOKS_DB_KEY']
if (!hexKey || hexKey.length !== 64) throw new Error('Encryption key not ready — ensure OS keychain is accessible')
const vaultKey = Buffer.from(hexKey, 'hex')
```

This unifies K_os and K_vault. The same 32-byte key is wrapped into the password slot and BIP-39 slot. No re-encryption is ever needed when setting or removing a password.

- [ ] **Step 3: Modify `vault:select` to intercept password-protected vaults**

Find `ipcMain.handle('vault:select', ...)` (around line 195). Replace it:

```typescript
ipcMain.handle('vault:select', async (_event, vaultPath: string) => {
  vaultManager.select(vaultPath)
  const enc = vaultManager.getEncryption()
  if (enc) {
    // Vault is password-protected — defer startApiForVault until vault:unlock
    return { needsPassword: true }
  }
  currentApiPort = await startApiForVault(vaultPath)
  mainWindow?.webContents.send('vault:ready')
  return { needsPassword: false }
})
```

- [ ] **Step 4: Add `vault:unlock` IPC handler**

Add this block immediately after the `vault:select` handler:

```typescript
ipcMain.handle('vault:unlock', async (_event, password: string) => {
  if (!password) throw new Error('Password must not be empty')
  const enc = vaultManager.getEncryption()
  if (!enc) throw new Error('Vault is not encrypted')

  const { salt, iv, ct } = enc.slots.password
  const derivedKey = Buffer.from(
    argon2id(Buffer.from(password, 'utf-8'), Buffer.from(salt, 'hex'), { ...enc.argon2, dkLen: 32 }),
  )
  let vaultKey: Buffer
  try {
    vaultKey = decryptVaultKey(Buffer.from(ct, 'hex'), derivedKey, Buffer.from(iv, 'hex'))
  } catch {
    throw new Error('Password is incorrect')
  }

  // Set vault key as the DB encryption key for this session
  process.env['COREBOOKS_DB_KEY'] = vaultKey.toString('hex')

  const vaultPath = requireCurrentVaultPath()
  currentApiPort = await startApiForVault(vaultPath)
  mainWindow?.webContents.send('vault:ready')
})
```

- [ ] **Step 5: Update `resetPasswordAfterRecovery` to re-save recovered key to OS keychain**

Find `ipcMain.handle('vault:resetPasswordAfterRecovery', ...)` (around line 371). After recovering `vaultKey` and before creating the new password slot, add:

```typescript
// After: vaultKey = decryptVaultKey(...)
// Before: const saltA = randomBytes(32)

// Re-save recovered key to OS keychain so future transparent opens work
try {
  if (safeStorage.isEncryptionAvailable()) {
    const userData = app.getPath('userData')
    const keyFile = path.join(userData, '.db.key')
    const encrypted = safeStorage.encryptString(vaultKey.toString('hex'))
    fs.writeFileSync(keyFile, encrypted, { mode: 0o600 })
    process.env['COREBOOKS_DB_KEY'] = vaultKey.toString('hex')
  }
} catch {
  // Non-fatal — app still works this session; next launch will re-derive from password
}
```

- [ ] **Step 6: Skip auto-open for password-protected vaults**

Find the auto-open block in `app.whenReady()` (around line 497):

```typescript
const skipUntil = vaultManager.getSkipPickerUntil()
if (skipUntil && new Date(skipUntil) > new Date()) {
  const knownVaults = vaultManager.list()
  if (knownVaults.length > 0) {
    try {
      vaultManager.select(knownVaults[0].path)
      currentApiPort = await startApiForVault(knownVaults[0].path)
    } catch {
      currentApiPort = null
    }
  }
}
```

Replace with:

```typescript
const skipUntil = vaultManager.getSkipPickerUntil()
if (skipUntil && new Date(skipUntil) > new Date()) {
  const knownVaults = vaultManager.list()
  if (knownVaults.length > 0) {
    try {
      vaultManager.select(knownVaults[0].path)
      const enc = vaultManager.getEncryption()
      if (!enc) {
        // Non-password vault: open transparently
        currentApiPort = await startApiForVault(knownVaults[0].path)
      }
      // Password-protected: leave currentApiPort null, vault picker shows
    } catch {
      currentApiPort = null
    }
  }
}
```

- [ ] **Step 7: Type-check**

```bash
npx tsc --project tsconfig.json --noEmit
```

Expected: zero errors.

- [ ] **Step 8: Commit**

```bash
git add src/electron/main.ts
git commit -m "feat: vault:unlock IPC, vault:select password gate, unified K_os/K_vault in setupEncryption"
```

---

### Task 7: Update `src/electron/preload.ts` and `src/ui/electron.d.ts`

**Files:**
- Modify: `src/electron/preload.ts`
- Modify: `src/ui/electron.d.ts`

- [ ] **Step 1: Add `vault.unlock` to preload**

In `src/electron/preload.ts`, find the `vault` object inside `contextBridge.exposeInMainWorld`. After the last existing vault entry, add:

```typescript
unlock: (password: string) => ipcRenderer.invoke('vault:unlock', password),
```

Also update `vault.select` return type — it now returns `{ needsPassword?: boolean }`. The IPC invoke already passes through the return value automatically, so no code change is needed in preload for `select`. Only the TypeScript type needs updating (in the next step).

- [ ] **Step 2: Update `src/ui/electron.d.ts`**

Find the `vault` interface. Change `select` return type and add `unlock`:

```typescript
select: (dirPath: string) => Promise<{ needsPassword?: boolean } | void>
unlock: (password: string) => Promise<void>
```

The full updated vault interface block (replace the existing one):

```typescript
vault: {
  getState: () => VaultState
  list: () => Promise<VaultEntry[]>
  create: (name: string, dirPath: string) => Promise<VaultEntry>
  select: (dirPath: string) => Promise<{ needsPassword?: boolean } | void>
  unlock: (password: string) => Promise<void>
  rename: (newName: string) => Promise<{ newPath: string }>
  showInExplorer: () => Promise<void>
  chooseDirectory: () => Promise<string | null>
  onReady: (cb: () => void) => () => void
  relaunch: () => Promise<void>
  listImports: () => Promise<VaultFileEntry[]>
  listVaultFiles: () => Promise<VaultFileEntry[]>
  moveFile: (srcPath: string, targetFolder: string) => Promise<string>
  deleteFile: (filePath: string) => Promise<void>
  readFile: (filePath: string) => Promise<string>
  onFileAdded: (cb: (event: FileAddedEvent) => void) => () => void
  onFileRemoved: (cb: (event: { path: string }) => void) => () => void
  safeStorageAvailable: () => Promise<boolean>
  setSkipUntil: (until: string | null) => Promise<void>
  getSkipUntil: () => Promise<string | null>
  getEncryptionStatus: () => Promise<{ encrypted: boolean }>
  setupEncryption: (password: string) => Promise<{ phraseWords: string[] }>
  verifyPassword: (password: string) => Promise<boolean>
  changePassword: (oldPassword: string, newPassword: string) => Promise<void>
  removeEncryption: (password: string) => Promise<void>
  regenerateRecovery: (password: string) => Promise<{ phraseWords: string[] }>
  resetPasswordAfterRecovery: (words: string[], newPassword: string) => Promise<void>
}
```

- [ ] **Step 3: Type-check UI**

```bash
npx tsc --project src/ui/tsconfig.json --noEmit
```

Expected: zero errors.

- [ ] **Step 4: Commit**

```bash
git add src/electron/preload.ts src/ui/electron.d.ts
git commit -m "feat: expose vault.unlock IPC in preload and type declarations"
```

---

### Task 8: Create `src/ui/components/UnlockVaultModal.tsx`

**Files:**
- Create: `src/ui/components/UnlockVaultModal.tsx`

- [ ] **Step 1: Write the component**

```tsx
import { useState, useRef, useEffect } from 'react'

interface UnlockVaultModalProps {
  vaultName: string
  onSuccess: () => void
  onCancel: () => void
}

export default function UnlockVaultModal({ vaultName, onSuccess, onCancel }: UnlockVaultModalProps) {
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!password || submitting) return
    setError(null)
    setSubmitting(true)
    try {
      await window.electronAPI?.vault.unlock(password)
      // vault:ready fires → VaultPickerPage's onReady → window.location.reload()
      onSuccess()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Incorrect password')
      setPassword('')
      setSubmitting(false)
      inputRef.current?.focus()
    }
  }

  return (
    /* Backdrop */
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="w-full max-w-sm bg-surface border border-rim rounded-xl px-6 py-6 shadow-2xl">
        <h2 className="text-base font-semibold text-chalk mb-1">Unlock vault</h2>
        <p className="text-sm text-ash mb-5 truncate">
          {vaultName}
        </p>

        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-chalk mb-1.5">
              Password
            </label>
            <input
              ref={inputRef}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              disabled={submitting}
              className="w-full bg-base border border-rim rounded-md px-3 py-2 text-sm text-chalk placeholder:text-ash focus:outline-none focus:border-neon transition-colors disabled:opacity-50"
              placeholder="Enter vault password"
            />
          </div>

          {error && (
            <p className="text-xs text-red-400">{error}</p>
          )}

          <div className="flex gap-3 pt-1">
            <button
              type="submit"
              disabled={!password || submitting}
              className="flex-1 bg-neon hover:bg-neon-dim text-void text-sm font-bold py-2 rounded-md transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {submitting ? 'Unlocking…' : 'Unlock'}
            </button>
            <button
              type="button"
              onClick={onCancel}
              disabled={submitting}
              className="px-4 py-2 bg-raised border border-rim rounded-md text-sm text-ash hover:text-chalk hover:border-neon/50 transition-colors cursor-pointer disabled:opacity-40"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --project src/ui/tsconfig.json --noEmit
```

Expected: zero errors.

- [ ] **Step 3: Commit**

```bash
git add src/ui/components/UnlockVaultModal.tsx
git commit -m "feat: add UnlockVaultModal — password prompt overlay for password-protected vaults"
```

---

### Task 9: Update `src/ui/pages/VaultPickerPage.tsx`

**Files:**
- Modify: `src/ui/pages/VaultPickerPage.tsx`

- [ ] **Step 1: Add unlock modal state and wire vault.select response**

Find the state declarations at the top of `VaultPickerPage`. Add two new state variables after the existing ones:

```typescript
const [unlockVault, setUnlockVault] = useState<{ name: string; path: string } | null>(null)
```

Find the `openVault` callback (around line 37). Replace it:

```typescript
const openVault = useCallback(async (vaultPath: string) => {
  setError(null)
  try {
    if (skipFor30Days) {
      await window.electronAPI?.vault.setSkipUntil(
        new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      )
    }
    const result = await window.electronAPI?.vault.select(vaultPath)
    if (result && 'needsPassword' in result && result.needsPassword) {
      const vault = vaults.find((v) => v.path === vaultPath)
      setUnlockVault({ name: vault?.name ?? vaultPath, path: vaultPath })
      return
    }
    // vault:ready fires → onReady callback → window.location.reload()
  } catch (e) {
    setError(e instanceof Error ? e.message : 'Failed to open vault')
  }
}, [skipFor30Days, vaults])
```

- [ ] **Step 2: Import and render UnlockVaultModal**

Add import at the top of the file:

```typescript
import UnlockVaultModal from '../components/UnlockVaultModal.js'
```

Inside the return JSX, add the modal just before the closing `</div>`:

```tsx
{unlockVault && (
  <UnlockVaultModal
    vaultName={unlockVault.name}
    onSuccess={() => {
      // vault:ready fires → onReady callback → window.location.reload()
      setUnlockVault(null)
    }}
    onCancel={() => {
      setUnlockVault(null)
      setSelectedPath(null)
      setError(null)
    }}
  />
)}
```

- [ ] **Step 3: Type-check**

```bash
npx tsc --project src/ui/tsconfig.json --noEmit
```

Expected: zero errors.

- [ ] **Step 4: Commit**

```bash
git add src/ui/pages/VaultPickerPage.tsx
git commit -m "feat: show UnlockVaultModal when vault:select returns needsPassword"
```

---

### Task 10: Integration tests

**Files:**
- Create: `tests/db/sqlcipherIntegration.test.ts`

- [ ] **Step 1: Write integration test**

```typescript
import { describe, it, expect, afterEach } from 'vitest'
import Database from 'better-sqlite3-multiple-ciphers'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { openDatabase } from '../../src/db/openDatabase.js'
import { ensureSchema } from '../../src/db/ensureSchema.js'
import { SqlCipherAdapterFactory } from '../../src/db/sqlcipherAdapter.js'

function tmpFile(): string {
  return path.join(os.tmpdir(), `cb_int_${Date.now()}_${Math.random().toString(36).slice(2)}.db`)
}

const files: string[] = []
function tracked(p: string): string { files.push(p); return p }
afterEach(() => { files.forEach((f) => { try { fs.unlinkSync(f) } catch {} }); files.length = 0 })

const KEY = 'deadbeef'.repeat(8) // 32 bytes hex

describe('SQLCipher integration', () => {
  it('openDatabase + ensureSchema + adapter round-trip', () => {
    const p = tracked(tmpFile())
    const db = openDatabase(p, KEY)

    // ensureSchema must not throw on keyed db
    expect(() => ensureSchema(db)).not.toThrow()

    // Tables were created inside the encrypted file
    const tables = (db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name",
    ).all() as { name: string }[]).map((r) => r.name)
    expect(tables).toContain('Account')
    expect(tables).toContain('JournalEntry')

    db.close()

    // Re-open with same key — data persists
    const db2 = openDatabase(p, KEY)
    const tables2 = (db2.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name",
    ).all() as { name: string }[]).map((r) => r.name)
    expect(tables2).toContain('Account')
    db2.close()
  })

  it('SqlCipherAdapterFactory wraps the keyed db correctly', async () => {
    const p = tracked(tmpFile())
    const db = openDatabase(p, KEY)
    ensureSchema(db)

    const factory = new SqlCipherAdapterFactory({ url: `file:${p}` }, undefined, db)
    const adapter = await factory.connect()

    // Query through the Prisma adapter
    const result = await adapter.queryRaw({
      sql: 'SELECT count(*) AS cnt FROM "Account"',
      args: [],
      argTypes: [],
    })
    expect(result.columnNames[0]).toBe('cnt')

    await adapter.dispose()
  })
})
```

- [ ] **Step 2: Run all tests**

```bash
npx vitest run tests/db/
```

Expected: all db tests passing (openDatabase × 4, sqlcipherAdapter × 2, sqlcipherIntegration × 2).

- [ ] **Step 3: Run full test suite**

```bash
npx vitest run
```

Expected: all existing tests still passing, new tests passing.

- [ ] **Step 4: Full type-check**

```bash
npx tsc --project tsconfig.json --noEmit && npx tsc --project src/ui/tsconfig.json --noEmit
```

Expected: zero errors on both.

- [ ] **Step 5: Commit**

```bash
git add tests/db/sqlcipherIntegration.test.ts
git commit -m "test: SQLCipher integration — openDatabase + ensureSchema + adapter round-trip"
```

---

### Task 11: Update `docs/SECURITY.md` and push

**Files:**
- Modify: `docs/SECURITY.md`

- [ ] **Step 1: Update SQLCipher status in SECURITY.md**

Find the paragraph that says SQLCipher is pending Plan F. Replace it with:

```markdown
The vault password protects the key slots stored in `.corebooks`. The `corebooks.db` file is encrypted at rest using SQLCipher with AES-256-CBC. The raw 256-bit key (`COREBOOKS_DB_KEY`) is the same as vault key K — set up via `setupEncryption` or generated transparently on first launch and stored in the OS keychain. Password-protected vaults require the vault password to unlock K on launch; non-password vaults unlock transparently via the OS keychain.
```

- [ ] **Step 2: Commit and push**

```bash
git add docs/SECURITY.md
git commit -m "docs: mark SQLCipher as complete in SECURITY.md"
git push origin main
```

Expected: push succeeds.

---

## Known limitations

- **Cross-machine non-password vaults**: if the OS keychain is unavailable on a new machine, `COREBOOKS_DB_KEY` is empty and the encrypted DB cannot open. This affects non-password vaults only; password-protected vaults use the BIP-39 recovery path.
- **PostgreSQL mode**: SQLCipher is SQLite-only. PostgreSQL uses server-side TLS. `openDatabase` is never called in PostgreSQL mode.
- **Linux without libsecret**: safeStorage unavailable → `COREBOOKS_DB_KEY` not set → DB opens without encryption. Amber warning already shown in VaultTab.
