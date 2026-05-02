import Fastify from 'fastify';
import sensible from '@fastify/sensible';
import { Account } from '../core/types/account.js';
import { Ledger } from '../core/engine/ledger.js';
import { accountRoutes } from './routes/accounts.js';
import { entryRoutes } from './routes/entries.js';
import { reportRoutes } from './routes/reports.js';
import { settingsRoutes } from './routes/settings.js';

export interface AppContext {
  ledger: Ledger;
  chartOfAccounts: Account[];
}

export interface BuildAppOptions {
  logger?: boolean;
}

export function buildApp(context: AppContext, opts: BuildAppOptions = {}) {
  const app = Fastify({ logger: opts.logger ?? true });

  app.register(sensible);

  app.get('/health', async () => ({ ok: true }));

  app.register(accountRoutes, { prefix: '/accounts', context });
  app.register(entryRoutes, { prefix: '/entries', context });
  app.register(reportRoutes, { prefix: '/reports', context });
  app.register(settingsRoutes, { prefix: '/settings', context });

  return app;
}
