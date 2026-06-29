import { FastifyPluginAsync } from 'fastify';
import type { AppContext } from '../server.js';
import { getPeriodConfig, savePeriodConfig, getClosedPeriods } from '../../db/repositories/periodRepository.js';
import { generateClosingEntry, postClosingEntry } from '../services/closingService.js';

interface RouteOptions {
  context: AppContext;
}

export const periodRoutes: FastifyPluginAsync<RouteOptions> = async (app, opts) => {
  const { ledger } = opts.context;

  app.get('/config', async () => getPeriodConfig());

  app.post<{ Body: Record<string, unknown> }>('/config', async (req, reply) => {
    const b = req.body;
    if (typeof b['fiscalYearEndMonth'] !== 'number' || typeof b['fiscalYearEndDay'] !== 'number') {
      return reply.badRequest('fiscalYearEndMonth and fiscalYearEndDay required');
    }
    return savePeriodConfig({
      fiscalYearEndMonth: b['fiscalYearEndMonth'],
      fiscalYearEndDay: b['fiscalYearEndDay'],
      closeFrequency: (b['closeFrequency'] as string) ?? 'year-end',
      retainedEarningsAcctId: (b['retainedEarningsAcctId'] as string | null) ?? null,
    });
  });

  app.get('/closed', async () => getClosedPeriods());

  app.post<{ Body: Record<string, unknown> }>('/generate-closing', async (req, reply) => {
    const { year, month } = req.body as { year: number; month: number };
    if (year == null || month == null) return reply.badRequest('year and month required');
    try {
      return await generateClosingEntry(year, month, ledger);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to generate closing entry.';
      return reply.badRequest(msg);
    }
  });

  app.post<{ Body: Record<string, unknown> }>('/post-closing', async (req, reply) => {
    const { draftId, year, month } = req.body as { draftId: string; year: number; month: number };
    if (!draftId || year == null || month == null) return reply.badRequest('draftId, year, month required');
    try {
      return await postClosingEntry(draftId, year, month, ledger);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to post closing entry.';
      return reply.badRequest(msg);
    }
  });
};
