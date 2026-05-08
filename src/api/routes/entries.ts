import { FastifyPluginAsync } from 'fastify';
import { EntryStatus } from '../../core/types/journal.js';
import { reverseEntry } from '../../core/engine/entries.js';
import { AppContext } from '../server.js';
import { listAccounts } from '../../db/repositories/accountRepository.js';
import {
  listPostedEntries,
  listDraftEntries,
  findEntryById,
  createDraftEntry,
  updateDraftEntry,
  deleteDraftEntry,
  postDraftEntry,
} from '../../db/repositories/entryRepository.js';
import { toDbJournalEntry, toCoreJournalEntry, PrismaJournalEntry } from '../../db/mappers.js';
import { getPrismaClient } from '../../db/client.js';

interface RouteOptions {
  context: AppContext;
}

export const entryRoutes: FastifyPluginAsync<RouteOptions> = async (app, opts) => {
  const { ledger } = opts.context;

  app.get<{ Querystring: { from?: string; to?: string } }>('/', async (req) => {
    const { from, to } = req.query
    return listPostedEntries(from, to)
  });

  // Must be registered before /:id so "drafts" isn't captured as an id param.
  app.get('/drafts', async () => {
    return listDraftEntries();
  });

  app.get<{ Params: { id: string } }>('/:id', async (req, reply) => {
    const entry = await findEntryById(req.params.id);
    if (!entry) return reply.notFound(`No entry found with id "${req.params.id}".`);
    return entry;
  });

  // Save (or re-save) a draft entry. If `id` is provided in the body, updates
  // an existing draft; otherwise creates a new one.
  app.post<{ Body: Record<string, unknown> }>('/draft', async (req, reply) => {
    const body = req.body;
    if (typeof body.memo !== 'string' || !Array.isArray(body.lines)) {
      return reply.badRequest('A draft entry requires a memo and a lines array.');
    }

    const draft = {
      date: typeof body.date === 'string' ? new Date(body.date) : new Date(),
      memo: body.memo,
      status: EntryStatus.Draft,
      paymentMethod: typeof body.paymentMethod === 'string' ? body.paymentMethod : undefined,
      lines: (body.lines as Record<string, unknown>[]).map((l) => ({
        accountId: String(l['accountId']),
        amount: Number(l['amount']),
        type: String(l['type']) as 'debit' | 'credit',
      })),
    };

    if (typeof body.id === 'string') {
      const existing = await findEntryById(body.id);
      if (!existing) return reply.notFound(`No draft found with id "${body.id}".`);
      if (existing.status === EntryStatus.Posted) {
        return reply.badRequest('Posted entries cannot be edited.');
      }
      const updated = await updateDraftEntry(body.id, { ...draft, id: body.id });
      return updated;
    }

    const saved = await createDraftEntry(draft);
    return reply.code(201).send(saved);
  });

  // Post a draft entry — runs full validation via the core engine.
  app.post<{ Body: { id: string } }>('/post', async (req, reply) => {
    const { id } = req.body;
    if (!id) return reply.badRequest('Request body must include the draft entry `id`.');

    const draft = await findEntryById(id);
    if (!draft) return reply.notFound(`No entry found with id "${id}".`);
    if (draft.status === EntryStatus.Posted) {
      return reply.badRequest('Entry is already posted.');
    }

    const chart = await listAccounts();
    const result = await postDraftEntry(draft, chart, ledger);
    if (!result.posted) {
      return reply.unprocessableEntity(JSON.stringify(result.errors));
    }
    return result.entry;
  });

  // Reverse a posted entry.
  app.post<{ Params: { id: string }; Body: { date?: string } }>('/:id/reverse', async (req, reply) => {
    const originalId = req.params.id;
    const date = req.body?.date ? new Date(req.body.date) : new Date();

    const chart = await listAccounts();
    const result = reverseEntry(originalId, date, ledger, chart);
    if (!result.posted) {
      return reply.unprocessableEntity(JSON.stringify(result.errors));
    }

    // Persist the reversal entry created in-memory by reverseEntry.
    const prisma = getPrismaClient();
    const data = toDbJournalEntry(result.entry);
    const row = await prisma.journalEntry.create({
      data: data as Parameters<typeof prisma.journalEntry.create>[0]['data'],
      include: { lines: { orderBy: { id: 'asc' } } },
    });
    const persisted = toCoreJournalEntry(row as unknown as PrismaJournalEntry);
    // Sync in-memory ID to DB-assigned cuid.
    result.entry.id = persisted.id;

    return persisted;
  });

  app.delete<{ Params: { id: string } }>('/:id', async (req, reply) => {
    const entry = await findEntryById(req.params.id);
    if (!entry) return reply.notFound(`No entry found with id "${req.params.id}".`);
    if (entry.status === EntryStatus.Posted) {
      return reply.badRequest('Posted entries cannot be deleted.');
    }
    await deleteDraftEntry(req.params.id);
    return reply.code(204).send();
  });
};
