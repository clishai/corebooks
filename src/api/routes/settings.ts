import fs from 'node:fs/promises';
import path from 'node:path';
import { FastifyPluginAsync } from 'fastify';
import { AppContext } from '../server.js';
import { getPrismaClient, isPostgresUrl, postgresHasSSL } from '../../db/client.js';
import { listAccounts } from '../../db/repositories/accountRepository.js';
import { listPostedEntries, listDraftEntries } from '../../db/repositories/entryRepository.js';

interface RouteOptions {
  context: AppContext;
}

function resolveDbPath(): string | null {
  const rawUrl = process.env['DATABASE_URL'] ?? 'file:corebooks.db';
  if (rawUrl.startsWith('postgresql://') || rawUrl.startsWith('postgres://')) return null;
  const rel = rawUrl.startsWith('file:') ? rawUrl.slice(5) : rawUrl;
  return path.resolve(process.cwd(), rel);
}

export const settingsRoutes: FastifyPluginAsync<RouteOptions> = async (app, opts) => {
  const { ledger } = opts.context;

  app.get('/database', async () => {
    const rawUrl = process.env['DATABASE_URL'] ?? 'file:./prisma/dev.db';
    if (isPostgresUrl(rawUrl)) {
      return { type: 'postgresql', path: null, sslEnabled: postgresHasSSL(rawUrl) };
    }
    return { type: 'sqlite', path: resolveDbPath(), sslEnabled: true };
  });

  app.get('/stats', async () => {
    const prisma = getPrismaClient();
    const [accounts, postedEntries, draftEntries] = await Promise.all([
      prisma.account.count(),
      prisma.journalEntry.count({ where: { status: 'Posted' } }),
      prisma.journalEntry.count({ where: { status: 'Draft' } }),
    ]);

    let fileSizeBytes: number | null = null;
    const dbPath = resolveDbPath();
    if (dbPath) {
      try {
        const stat = await fs.stat(dbPath);
        fileSizeBytes = stat.size;
      } catch {
        // file not accessible; omit size
      }
    }

    return { accounts, postedEntries, draftEntries, fileSizeBytes };
  });

  app.get('/export', async (_req, reply) => {
    const [accounts, postedEntries, draftEntries] = await Promise.all([
      listAccounts(),
      listPostedEntries(),
      listDraftEntries(),
    ]);
    reply.header('Content-Type', 'application/json');
    return {
      exportedAt: new Date().toISOString(),
      version: '1',
      accounts,
      entries: [...postedEntries, ...draftEntries],
    };
  });

  app.post('/wipe', async () => {
    const prisma = getPrismaClient();
    await prisma.journalEntry.deleteMany({});  // cascades to JournalLine
    await prisma.account.deleteMany({});
    ledger.reset();
    return { wiped: true };
  });
};
