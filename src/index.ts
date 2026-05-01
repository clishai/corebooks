import 'dotenv/config';
import path from 'path';
import { loadLedger } from './db/repositories/entryRepository.js';
import { listAccounts } from './db/repositories/accountRepository.js';
import { disconnectPrisma } from './db/client.js';
import { buildApp } from './api/server.js';
import { ensureSchema } from './db/ensureSchema.js';

const PORT = parseInt(process.env['PORT'] ?? '3000', 10);
const HOST = process.env['HOST'] ?? '127.0.0.1';

async function main() {
  const rawUrl = process.env['DATABASE_URL'] ?? 'file:corebooks.db';
  if (!rawUrl.startsWith('postgresql://') && !rawUrl.startsWith('postgres://')) {
    const filePath = rawUrl.startsWith('file:') ? rawUrl.slice(5) : rawUrl;
    const dbPath = path.isAbsolute(filePath) ? filePath : path.resolve(process.cwd(), filePath);
    ensureSchema(dbPath);
  }

  const [ledger, chartOfAccounts] = await Promise.all([loadLedger(), listAccounts()]);
  const app = buildApp({ ledger, chartOfAccounts });

  try {
    await app.listen({ port: PORT, host: HOST });
  } catch (err) {
    app.log.error(err);
    await disconnectPrisma();
    process.exit(1);
  }
}

main();
