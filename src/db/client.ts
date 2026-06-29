import { PrismaClient } from '../generated/prisma/client.js';
import { SqlCipherAdapterFactory } from './sqlcipherAdapter.js';
import { openDatabase } from './openDatabase.js';
import type Database from 'better-sqlite3-multiple-ciphers';

type Db = InstanceType<typeof Database>;

// ── PostgreSQL URL helpers ────────────────────────────────────────────────────

export function isPostgresUrl(rawUrl: string): boolean {
  return rawUrl.startsWith('postgresql://') || rawUrl.startsWith('postgres://');
}

export function postgresHasSSL(rawUrl: string): boolean {
  return (
    rawUrl.includes('sslmode=require') ||
    rawUrl.includes('sslmode=verify-full') ||
    rawUrl.includes('sslmode=verify-ca') ||
    rawUrl.includes('ssl=true')
  );
}

// Warn loudly when a PostgreSQL URL is missing an explicit sslmode. Financial
// data travelling unencrypted over the network is a serious privacy risk.
function checkPostgresSSL(rawUrl: string): void {
  if (!isPostgresUrl(rawUrl)) return;
  if (!postgresHasSSL(rawUrl)) {
    process.stderr.write(
      '[corebooks] WARNING: PostgreSQL DATABASE_URL does not specify sslmode. ' +
      'Add ?sslmode=require to encrypt data in transit.\n',
    );
  }
}

// Module-level reference to the opened Database instance.
// Set by createPrismaClient() for the SQLite path so that bootstrap.ts can
// retrieve it via getOpenDb() and pass it to ensureSchema() — avoiding a
// second open/close cycle on the same file.
let _db: Db | undefined;

/**
 * Returns the Database instance that was opened by the most recent call to
 * getPrismaClient() / createPrismaClient(). Returns undefined in PostgreSQL
 * mode (where there is no better-sqlite3 Database).
 *
 * Callers (e.g. bootstrap.ts) should call getPrismaClient() before
 * getOpenDb() to guarantee the instance exists.
 */
export function getOpenDb(): Db | undefined {
  return _db;
}

function createPrismaClient(): PrismaClient {
  const rawUrl = process.env['DATABASE_URL'] ?? 'file:corebooks.db';
  checkPostgresSSL(rawUrl);

  // SQLite path — open the database with SQLCipher, then hand the pre-opened
  // instance to SqlCipherAdapterFactory so Prisma never sees a plaintext file.
  // Note: the Prisma schema is SQLite-only (provider = "sqlite"), so PostgreSQL
  // mode uses a separate Prisma setup at the infrastructure level. This client
  // is always the SQLite path.
  const filePath = rawUrl.startsWith('file:') ? rawUrl.slice(5) : rawUrl;
  const key = process.env['COREBOOKS_DB_KEY'] ?? '';
  _db = openDatabase(filePath, key);
  const factory = new SqlCipherAdapterFactory({ url: filePath }, _db);
  // PrismaClient accepts a SqlDriverAdapterFactory directly; it calls
  // factory.connect() internally the first time a connection is needed.
  return new PrismaClient({ adapter: factory });
}

let _client: PrismaClient | undefined;

export function getPrismaClient(): PrismaClient {
  if (!_client) _client = createPrismaClient();
  return _client;
}

export async function disconnectPrisma(): Promise<void> {
  if (_client) {
    await _client.$disconnect();
    _client = undefined;
  }
}
