import Fastify from 'fastify';
import sensible from '@fastify/sensible';
import { Account } from '../core/types/account.js';
import { Ledger } from '../core/engine/ledger.js';
import { accountRoutes } from './routes/accounts.js';
import { entryRoutes } from './routes/entries.js';
import { reportRoutes } from './routes/reports.js';

export interface AppContext {
  ledger: Ledger;
  chartOfAccounts: Account[];
}

export function buildApp(context: AppContext) {
  const app = Fastify({ logger: true });

  app.register(sensible);

  app.register(accountRoutes, { prefix: '/accounts', context });
  app.register(entryRoutes, { prefix: '/entries', context });
  app.register(reportRoutes, { prefix: '/reports', context });

  return app;
}
