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

export interface PrismaBundle {
  client: PrismaClient;
  db: Db;
}

// Module-level singletons set by createPrismaClient().
let _client: PrismaClient | undefined;
let _db: Db | undefined;

/**
 * Creates a new PrismaClient backed by an SQLCipher-keyed Database, stores
 * both as the module singletons, and returns the bundle. Callers (e.g.
 * bootstrap.ts) should call this before any repository functions.
 *
 * key: Buffer with the 32-byte SQLCipher key, or null to open as plaintext
 * (used in tests and non-Electron CLI mode).
 */
export function createPrismaClient(args: { filePath: string; key: Buffer | null }): PrismaBundle {
  const db = openDatabase({ filePath: args.filePath, key: args.key });
  const factory = new SqlCipherAdapterFactory({ url: args.filePath }, db);
  const client = new PrismaClient({ adapter: factory });
  _client = client;
  _db = db;
  return { client, db };
}

/**
 * Returns the PrismaClient singleton, creating it from DATABASE_URL if it has
 * not been initialised yet (used by tests and the non-Electron CLI entry point).
 * In tests the DB is always plaintext, so key is null.
 */
export function getPrismaClient(): PrismaClient {
  if (!_client) {
    const rawUrl = process.env['DATABASE_URL'] ?? 'file:corebooks.db';
    checkPostgresSSL(rawUrl);
    const filePath = rawUrl.startsWith('file:') ? rawUrl.slice(5) : rawUrl;
    // No key: open as plaintext. This path is used by tests and by the
    // non-Electron CLI (src/index.ts). Electron always calls createPrismaClient
    // with an explicit Buffer key before any repo functions run.
    createPrismaClient({ filePath, key: null });
  }
  return _client!;
}

/**
 * Returns the Database instance that was opened by the most recent call to
 * createPrismaClient() / getPrismaClient(). Returns undefined if neither has
 * been called yet.
 */
export function getOpenDb(): Db | undefined {
  return _db;
}

export async function disconnectPrisma(): Promise<void> {
  if (_client) {
    await _client.$disconnect();
    _client = undefined;
    _db = undefined;
  }
}
