import 'dotenv/config';
import path from 'path';
import { loadLedger } from '../db/repositories/entryRepository.js';
import { listAccounts } from '../db/repositories/accountRepository.js';
import { disconnectPrisma } from '../db/client.js';
import { buildApp } from './server.js';
import { ensureSchema } from '../db/ensureSchema.js';

export async function startServer(port: number): Promise<void> {
  const rawUrl = process.env['DATABASE_URL'] ?? 'file:corebooks.db';
  if (!rawUrl.startsWith('postgresql://') && !rawUrl.startsWith('postgres://')) {
    const filePath = rawUrl.startsWith('file:') ? rawUrl.slice(5) : rawUrl;
    const dbPath = path.isAbsolute(filePath) ? filePath : path.resolve(process.cwd(), filePath);
    ensureSchema(dbPath);
  }

  const [ledger, chartOfAccounts] = await Promise.all([
    loadLedger(),
    listAccounts(),
  ]);

  const app = buildApp({ ledger, chartOfAccounts }, { logger: false });

  try {
    await app.listen({ port, host: '127.0.0.1' });
  } catch (err) {
    await disconnectPrisma();
    throw err;
  }
}
