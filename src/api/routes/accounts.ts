import { FastifyPluginAsync } from 'fastify';
import { AppContext } from '../server.js';
import {
  listAccounts,
  findAccountById,
  createAccount,
  updateAccount,
} from '../../db/repositories/accountRepository.js';

interface RouteOptions {
  context: AppContext;
}

export const accountRoutes: FastifyPluginAsync<RouteOptions> = async (app) => {
  app.get('/', async () => {
    return listAccounts();
  });

  app.get<{ Params: { id: string } }>('/:id', async (req, reply) => {
    const account = await findAccountById(req.params.id);
    if (!account) return reply.notFound(`No account found with id "${req.params.id}".`);
    return account;
  });

  app.post<{ Body: Record<string, unknown> }>('/', async (req, reply) => {
    const body = req.body;
    if (
      typeof body.number !== 'string' ||
      typeof body.name !== 'string' ||
      typeof body.type !== 'string' ||
      typeof body.normalBalance !== 'string' ||
      typeof body.isContra !== 'boolean'
    ) {
      return reply.badRequest('Missing or invalid required account fields.');
    }
    const account = await createAccount({
      number: body.number,
      name: body.name,
      type: body.type as Parameters<typeof createAccount>[0]['type'],
      normalBalance: body.normalBalance as 'debit' | 'credit',
      isContra: body.isContra,
      contraTo:
        typeof body.contraTo === 'string'
          ? (body.contraTo as Parameters<typeof createAccount>[0]['contraTo'])
          : undefined,
      classification:
        typeof body.classification === 'string'
          ? (body.classification as 'current' | 'non-current')
          : undefined,
    });
    return reply.code(201).send(account);
  });

  app.patch<{ Params: { id: string }; Body: Record<string, unknown> }>('/:id', async (req, reply) => {
    const existing = await findAccountById(req.params.id);
    if (!existing) return reply.notFound(`No account found with id "${req.params.id}".`);
    const updated = await updateAccount(req.params.id, req.body as Parameters<typeof updateAccount>[1]);
    return updated;
  });
};
