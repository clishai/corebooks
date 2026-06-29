import 'dotenv/config';
import path from 'path';
import { Ledger } from '../core/engine/ledger.js';
import { loadLedger } from '../db/repositories/entryRepository.js';
import { listAccounts } from '../db/repositories/accountRepository.js';
import { disconnectPrisma } from '../db/client.js';
import { buildApp } from './server.js';
import { ensureSchema } from '../db/ensureSchema.js';
import { openDatabase } from '../db/openDatabase.js';

// Module-level ledger reference — populated by startServer() so that
// callers (e.g. the Electron main process recurring check) can access it
// without needing to reconstruct it.
export let ledger: Ledger = new Ledger();

export async function startServer(port: number): Promise<void> {
  const rawUrl = process.env['DATABASE_URL'] ?? 'file:corebooks.db';
  if (!rawUrl.startsWith('postgresql://') && !rawUrl.startsWith('postgres://')) {
    const filePath = rawUrl.startsWith('file:') ? rawUrl.slice(5) : rawUrl;
    const dbPath = path.isAbsolute(filePath) ? filePath : path.resolve(process.cwd(), filePath);
    const schemaDb = openDatabase(dbPath, process.env['COREBOOKS_DB_KEY'] ?? '');
    try {
      ensureSchema(schemaDb);
    } finally {
      schemaDb.close();
    }
  }

  const [loadedLedger, chartOfAccounts] = await Promise.all([
    loadLedger(),
    listAccounts(),
  ]);

  // Update the exported reference so downstream callers see the live ledger.
  ledger = loadedLedger;

  const app = buildApp({ ledger, chartOfAccounts }, { logger: false });

  try {
    await app.listen({ port, host: '127.0.0.1' });
  } catch (err) {
    await disconnectPrisma();
    throw err;
  }
}
