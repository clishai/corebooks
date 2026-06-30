import 'dotenv/config';
import { Ledger } from '../core/engine/ledger.js';
import { loadLedger } from '../db/repositories/entryRepository.js';
import { listAccounts } from '../db/repositories/accountRepository.js';
import { createPrismaClient, disconnectPrisma } from '../db/client.js';
import { buildApp } from './server.js';
import { ensureSchema } from '../db/ensureSchema.js';

// Module-level ledger reference — populated by startServer() so that
// callers (e.g. the Electron main process recurring check) can access it
// without needing to reconstruct it.
export let ledger: Ledger = new Ledger();

export async function startServer(args: { filePath: string; key: Buffer; port: number }): Promise<void> {
  // Open the database with the explicit key, run schema migrations on the
  // already-open keyed instance, then hand the Prisma client to the repos.
  const { db } = createPrismaClient({ filePath: args.filePath, key: args.key });
  ensureSchema(db);

  const [loadedLedger, chartOfAccounts] = await Promise.all([
    loadLedger(),
    listAccounts(),
  ]);

  // Update the exported reference so downstream callers see the live ledger.
  ledger = loadedLedger;

  const app = buildApp({ ledger, chartOfAccounts }, { logger: false });

  try {
    await app.listen({ port: args.port, host: '127.0.0.1' });
  } catch (err) {
    await disconnectPrisma();
    throw err;
  }
}
