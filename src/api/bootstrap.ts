import 'dotenv/config';
import { Ledger } from '../core/engine/ledger.js';
import { loadLedger } from '../db/repositories/entryRepository.js';
import { listAccounts } from '../db/repositories/accountRepository.js';
import { getPrismaClient, getOpenDb, disconnectPrisma } from '../db/client.js';
import { buildApp } from './server.js';
import { ensureSchema } from '../db/ensureSchema.js';

// Module-level ledger reference — populated by startServer() so that
// callers (e.g. the Electron main process recurring check) can access it
// without needing to reconstruct it.
export let ledger: Ledger = new Ledger();

export async function startServer(port: number): Promise<void> {
  // Calling getPrismaClient() first ensures the Database instance is opened
  // (with the SQLCipher key applied) and stored in client.ts before we ask
  // for it via getOpenDb(). In SQLite mode, getOpenDb() returns the same
  // pre-opened, already-keyed instance — no second open/close cycle needed.
  getPrismaClient();
  const db = getOpenDb();
  if (db !== undefined) {
    // SQLite mode — run schema migrations on the already-open keyed instance.
    ensureSchema(db);
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
