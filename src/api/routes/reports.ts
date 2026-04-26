import { FastifyPluginAsync } from 'fastify';
import { trialBalance, balanceSheet, incomeStatement } from '../../core/engine/reporting.js';
import { AppContext } from '../server.js';
import { listAccounts } from '../../db/repositories/accountRepository.js';

interface RouteOptions {
  context: AppContext;
}

export const reportRoutes: FastifyPluginAsync<RouteOptions> = async (app, opts) => {
  const { ledger } = opts.context;

  app.get('/trial-balance', async () => {
    const chart = await listAccounts();
    return trialBalance(ledger, chart);
  });

  app.get<{ Querystring: { asOf?: string } }>('/balance-sheet', async (req, reply) => {
    const { asOf } = req.query;
    if (!asOf) return reply.badRequest('Query parameter `asOf` (YYYY-MM-DD) is required.');
    const date = new Date(asOf);
    if (isNaN(date.getTime())) return reply.badRequest('`asOf` must be a valid date (YYYY-MM-DD).');
    const chart = await listAccounts();
    return balanceSheet(ledger, chart, date);
  });

  app.get<{ Querystring: { from?: string; to?: string } }>('/income-statement', async (req, reply) => {
    const { from, to } = req.query;
    if (!from || !to) {
      return reply.badRequest('Query parameters `from` and `to` (YYYY-MM-DD) are required.');
    }
    const fromDate = new Date(from);
    const toDate = new Date(to);
    if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) {
      return reply.badRequest('`from` and `to` must be valid dates (YYYY-MM-DD).');
    }
    if (fromDate > toDate) {
      return reply.badRequest('`from` must be before or equal to `to`.');
    }
    const chart = await listAccounts();
    return incomeStatement(ledger, chart, fromDate, toDate);
  });
};
