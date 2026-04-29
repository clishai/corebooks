import Database from 'better-sqlite3'
import { readFileSync, unlinkSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'
import { randomUUID } from 'node:crypto'
import { disconnectPrisma, getPrismaClient } from '../../src/db/client.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

// Run the init migration SQL directly against a fresh SQLite file.
// This is faster than spawning `prisma migrate deploy` and avoids any
// network or CLI dependency in the test environment.
const migrationSql = readFileSync(
  join(__dirname, '../../prisma/migrations/20260426135826_init/migration.sql'),
  'utf8',
)

/**
 * Creates a temporary SQLite file, runs the schema migration, and returns
 * the absolute file path. Set process.env.DATABASE_URL = `file:${path}`
 * before the first call to getPrismaClient() in your test file.
 */
export function createTestDb(): string {
  const dbPath = join(tmpdir(), `corebooks-test-${randomUUID()}.db`)
  const db = new Database(dbPath)
  db.exec(migrationSql)
  db.close()
  return dbPath
}

/**
 * Deletes all rows from every table in the correct foreign-key order.
 * Call in beforeEach to give each test a clean slate without recreating
 * the schema.
 */
export async function clearTestDb(): Promise<void> {
  const prisma = getPrismaClient()
  await prisma.journalLine.deleteMany()
  await prisma.journalEntry.deleteMany()
  await prisma.account.deleteMany()
}

/**
 * Disconnects Prisma and deletes the temporary database file.
 * Call in afterAll.
 */
export async function destroyTestDb(dbPath: string): Promise<void> {
  await disconnectPrisma()
  if (existsSync(dbPath)) unlinkSync(dbPath)
}
