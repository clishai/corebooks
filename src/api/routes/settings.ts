import fs from 'node:fs/promises';
import path from 'node:path';
import { FastifyPluginAsync } from 'fastify';
import { AppContext } from '../server.js';
import { getPrismaClient, isPostgresUrl, postgresHasSSL } from '../../db/client.js';
import { listAccounts } from '../../db/repositories/accountRepository.js';
import { listPostedEntries, listDraftEntries } from '../../db/repositories/entryRepository.js';
import { getAppSetting, listAppSettings, setAppSetting } from '../../db/repositories/appSettingRepository.js';
import { logAuditEvent } from '../../db/repositories/auditRepository.js';
import {
  importCoreJSON,
  importCSV,
  importIIF,
  type CsvMapping,
  type ImportOptions,
} from '../services/importService.js';

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

  app.get('/app-settings', async () => listAppSettings());

  app.post<{ Body: Record<string, unknown> }>('/app-settings', async (req) => {
    const saved: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(req.body)) {
      saved[key] = await setAppSetting(key, value);
    }
    return saved;
  });

  app.get('/vault-health', async () => {
    const prisma = getPrismaClient();
    const dbPath = resolveDbPath();
    const [accounts, postedEntries, draftEntries, lastBackupAt] = await Promise.all([
      prisma.account.count(),
      prisma.journalEntry.count({ where: { status: 'Posted' } }),
      prisma.journalEntry.count({ where: { status: 'Draft' } }),
      getAppSetting<string | null>('lastBackupAt', null),
    ]);
    let fileSizeBytes: number | null = null;
    if (dbPath) {
      try {
        fileSizeBytes = (await fs.stat(dbPath)).size;
      } catch {
        fileSizeBytes = null;
      }
    }
    return {
      databasePath: dbPath,
      fileSizeBytes,
      accounts,
      postedEntries,
      draftEntries,
      lastBackupAt,
      generatedAt: new Date().toISOString(),
    };
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

  app.get('/backup', async (_req, reply) => {
    const [accounts, postedEntries, draftEntries] = await Promise.all([
      listAccounts(),
      listPostedEntries(),
      listDraftEntries(),
    ]);
    const backedUpAt = new Date().toISOString();
    await setAppSetting('lastBackupAt', backedUpAt);
    await logAuditEvent({
      action: 'backup.created',
      entityType: 'Vault',
      detail: { backedUpAt },
    });
    reply.header('Content-Type', 'application/json');
    return {
      exportedAt: backedUpAt,
      backup: true,
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
    await logAuditEvent({ action: 'data.wiped', entityType: 'Vault' });
    return { wiped: true };
  });

  // 50 MB body limit to accommodate large export files
  app.post<{ Body: Record<string, unknown> }>(
    '/import',
    { bodyLimit: 50 * 1024 * 1024 },
    async (req, reply) => {
      const body = req.body;
      const format = body['format'];
      const data = body['data'];
      const rawOptions = body['options'] as Record<string, unknown> | undefined;

      if (typeof format !== 'string' || !['corebooks-json', 'csv', 'iif'].includes(format)) {
        return reply.badRequest('format must be one of: corebooks-json, csv, iif');
      }
      if (typeof data !== 'string' || !data.trim()) {
        return reply.badRequest('data must be a non-empty string.');
      }

      const options: ImportOptions = {
        createMissingAccounts: rawOptions?.['createMissingAccounts'] !== false,
        importAs: rawOptions?.['importAs'] === 'posted' ? 'posted' : 'draft',
      };

      try {
        if (format === 'corebooks-json') {
          return await importCoreJSON(data, ledger, options);
        }

        if (format === 'csv') {
          const rawMapping = body['mapping'] as Record<string, unknown> | undefined;
          if (!rawMapping || typeof rawMapping['date'] !== 'string' || typeof rawMapping['account'] !== 'string') {
            return reply.badRequest('CSV imports require a mapping with at least date and account fields.');
          }
          const mapping: CsvMapping = {
            date: rawMapping['date'] as string,
            account: rawMapping['account'] as string,
            debit: typeof rawMapping['debit'] === 'string' ? rawMapping['debit'] : '',
            credit: typeof rawMapping['credit'] === 'string' ? rawMapping['credit'] : '',
            memo: typeof rawMapping['memo'] === 'string' ? rawMapping['memo'] : undefined,
            reference: typeof rawMapping['reference'] === 'string' ? rawMapping['reference'] : undefined,
            paymentMethod: typeof rawMapping['paymentMethod'] === 'string' ? rawMapping['paymentMethod'] : undefined,
          };
          return await importCSV(data, mapping, options, ledger);
        }

        // iif
        return await importIIF(data, options, ledger);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Import failed.';
        return reply.badRequest(msg);
      }
    },
  );
};
