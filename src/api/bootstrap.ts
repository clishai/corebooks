import 'dotenv/config';
import { createServer } from 'node:net';
import { Ledger } from '../core/engine/ledger.js';
import { loadLedger } from '../db/repositories/entryRepository.js';
import { listAccounts } from '../db/repositories/accountRepository.js';
import { disconnectPrisma } from '../db/client.js';
import { buildApp } from './server.js';
import { ensureSchema } from '../db/ensureSchema.js';
import type Database from 'better-sqlite3-multiple-ciphers';

type Db = InstanceType<typeof Database>;

// Module-level ledger reference — populated by startApi() so that
// callers (e.g. the Electron main process recurring check) can access it
// without needing to reconstruct it.
export let ledger: Ledger = new Ledger();

function findFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      if (addr && typeof addr === 'object') {
        const { port } = addr;
        server.close(() => resolve(port));
      } else {
        server.close(() => reject(new Error('Could not determine a free port')));
      }
    });
  });
}

/**
 * Start the Fastify API using the already-keyed Database opened by the caller
 * (typically VaultLifecycle via main.ts's DbFactory). The Prisma singleton in
 * src/db/client.ts must already have been set via createPrismaClient() before
 * this is called.
 *
 * Returns the chosen 127.0.0.1 port the API is listening on plus a `stop`
 * function that shuts the Fastify instance down (so the lifecycle owner can
 * close it without leaking a listener when a vault is closed or switched).
 */
export async function startApi(args: { db: Db }): Promise<{ port: number; stop: () => Promise<void> }> {
  ensureSchema(args.db);

  const [loadedLedger, chartOfAccounts] = await Promise.all([
    loadLedger(),
    listAccounts(),
  ]);
  // Update the exported reference so downstream callers see the live ledger.
  ledger = loadedLedger;

  const app = buildApp({ ledger, chartOfAccounts }, { logger: false });

  const port = await findFreePort();
  try {
    await app.listen({ port, host: '127.0.0.1' });
  } catch (err) {
    await disconnectPrisma();
    throw err;
  }
  return { port, stop: () => app.close() };
}
