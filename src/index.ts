import 'dotenv/config';
import { loadLedger } from './db/repositories/entryRepository.js';
import { listAccounts } from './db/repositories/accountRepository.js';
import { disconnectPrisma } from './db/client.js';
import { buildApp } from './api/server.js';

const PORT = parseInt(process.env['PORT'] ?? '3000', 10);
const HOST = process.env['HOST'] ?? '0.0.0.0';

async function main() {
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
