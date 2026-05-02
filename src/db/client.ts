import { PrismaClient } from '../generated/prisma/client.js';
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';

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

// ── SQLCipher hook (future) ───────────────────────────────────────────────────
// When SQLCipher support is added, this is where the at-rest encryption key
// gets applied. The key is already generated and stored via Electron safeStorage
// (see src/electron/main.ts) and surfaced here as COREBOOKS_DB_KEY.
//
// Pending work: PrismaBetterSqlite3 creates the better-sqlite3 Database
// internally and does not expose a PRAGMA hook. Full SQLCipher support requires
// either a custom Prisma driver adapter or official support from Prisma.
//
// Once unblocked, the implementation is:
//   import Database from 'better-sqlite3-sqlcipher';
//   const db = new Database(filePath);
//   const key = process.env['COREBOOKS_DB_KEY'];
//   if (key) db.pragma(`key = '${key}'`);
//   const adapter = new PrismaBetterSqlite3({ url: filePath }, db);

function createPrismaClient(): PrismaClient {
  const rawUrl = process.env['DATABASE_URL'] ?? 'file:corebooks.db';
  checkPostgresSSL(rawUrl);
  // PrismaBetterSqlite3 expects a file path, not a file: URI.
  const filePath = rawUrl.startsWith('file:') ? rawUrl.slice(5) : rawUrl;
  const adapter = new PrismaBetterSqlite3({ url: filePath });
  return new PrismaClient({ adapter });
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
