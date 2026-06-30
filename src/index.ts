import 'dotenv/config';
import path from 'path';
import { disconnectPrisma, createPrismaClient } from './db/client.js';
import { buildApp } from './api/server.js';
import { ensureSchema } from './db/ensureSchema.js';
import { loadLedger } from './db/repositories/entryRepository.js';
import { listAccounts } from './db/repositories/accountRepository.js';

const PORT = parseInt(process.env['PORT'] ?? '3000', 10);
const HOST = process.env['HOST'] ?? '127.0.0.1';

async function main() {
  const rawUrl = process.env['DATABASE_URL'] ?? 'file:corebooks.db';
  if (!rawUrl.startsWith('postgresql://') && !rawUrl.startsWith('postgres://')) {
    const filePath = rawUrl.startsWith('file:') ? rawUrl.slice(5) : rawUrl;
    const dbPath = path.isAbsolute(filePath) ? filePath : path.resolve(process.cwd(), filePath);
    // CLI / non-Electron mode: no Electron safeStorage, so no encryption key.
    // Open as plaintext (key: null). To use encryption in CLI mode, derive a
    // key externally and pass it via createPrismaClient before this function.
    try {
      const { db } = createPrismaClient({ filePath: dbPath, key: null });
      ensureSchema(db);
    } catch (err) {
      if (String(err).includes('encrypted')) {
        process.stderr.write(
          `[corebooks] ERROR: The database at "${dbPath}" appears to be encrypted.\n` +
          `  Use the Electron app to open encrypted vaults.\n`
        );
        process.exit(1);
      }
      throw err;
    }
  }

  const [ledger, chartOfAccounts] = await Promise.all([loadLedger(), listAccounts()]);
  const app = buildApp({ ledger, chartOfAccounts });

  try {
    await app.listen({ port: PORT, host: HOST });
  } catch (err: unknown) {
    if (err instanceof Error && 'code' in err && (err as NodeJS.ErrnoException).code === 'EADDRINUSE') {
      process.stderr.write(`\nPort ${PORT} is already in use. Stop any other process using that port and try again.\n\n`);
    } else {
      app.log.error(err);
    }
    await disconnectPrisma();
    process.exit(1);
  }
}

main();
