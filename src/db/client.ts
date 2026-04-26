import { PrismaClient } from '../generated/prisma/client.js';
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';

function createPrismaClient(): PrismaClient {
  const rawUrl = process.env['DATABASE_URL'] ?? 'file:corebooks.db';
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
