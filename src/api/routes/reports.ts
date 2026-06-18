import { FastifyPluginAsync } from 'fastify';
import { trialBalance, balanceSheet, incomeStatement } from '../../core/engine/reporting.js';
import { AppContext } from '../server.js';
import { listAccounts } from '../../db/repositories/accountRepository.js';
import { listPostedEntries } from '../../db/repositories/entryRepository.js';

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

  app.get<{ Querystring: { from?: string; to?: string } }>('/general-ledger', async (req) => {
    const [accounts, entries] = await Promise.all([
      listAccounts(),
      listPostedEntries(req.query.from, req.query.to),
    ]);
    const accountMap = new Map(accounts.map((account) => [account.id, account]));
    return entries.flatMap((entry) =>
      entry.lines.map((line) => ({
        entryId: entry.id,
        date: entry.date,
        memo: entry.memo,
        accountId: line.accountId,
        accountNumber: accountMap.get(line.accountId)?.number ?? '',
        accountName: accountMap.get(line.accountId)?.name ?? line.accountId,
        debit: line.type === 'debit' ? line.amount : 0,
        credit: line.type === 'credit' ? line.amount : 0,
      })),
    );
  });

  app.get<{ Querystring: { accountId?: string; from?: string; to?: string } }>('/account-activity', async (req, reply) => {
    if (!req.query.accountId) return reply.badRequest('accountId is required.');
    const entries = await listPostedEntries(req.query.from, req.query.to);
    let running = 0;
    return entries
      .slice()
      .reverse()
      .flatMap((entry) => entry.lines
        .filter((line) => line.accountId === req.query.accountId)
        .map((line) => {
          running += line.type === 'debit' ? line.amount : -line.amount;
          return {
            entryId: entry.id,
            date: entry.date,
            memo: entry.memo,
            debit: line.type === 'debit' ? line.amount : 0,
            credit: line.type === 'credit' ? line.amount : 0,
            running,
          };
        }));
  });

  app.get<{ Querystring: { from?: string; to?: string } }>('/cash-flow', async (req) => {
    const [accounts, entries] = await Promise.all([
      listAccounts(),
      listPostedEntries(req.query.from, req.query.to),
    ]);
    const cashAccounts = new Set(accounts
      .filter((account) => account.type === 'Asset' && /cash|bank|checking|savings/i.test(`${account.name} ${account.number}`))
      .map((account) => account.id));
    const netCash = entries.reduce((sum, entry) => sum + entry.lines.reduce((lineSum, line) => {
      if (!cashAccounts.has(line.accountId)) return lineSum;
      return lineSum + (line.type === 'debit' ? line.amount : -line.amount);
    }, 0), 0);
    return { netCash, cashAccountIds: Array.from(cashAccounts), entryCount: entries.length };
  });
};
