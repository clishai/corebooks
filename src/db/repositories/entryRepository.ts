import { Account } from '../../core/types/account.js';
import { EntryStatus, JournalEntry } from '../../core/types/journal.js';
import { postEntry } from '../../core/engine/entries.js';
import { Ledger } from '../../core/engine/ledger.js';
import { ValidationError } from '../../core/validation/entry.js';
import { getPrismaClient } from '../client.js';
import { PrismaJournalEntry, toCoreJournalEntry, toDbCents, toDbJournalEntry } from '../mappers.js';
import { isPeriodClosed } from './periodRepository.js';
import type { PostingAuthority, PostingChannel } from '../../types/posting.js';

const INCLUDE_LINES = { lines: { orderBy: { id: 'asc' as const } } };
const ALLOWED_POSTING_CHANNELS = new Set<PostingChannel>([
  'human',
  'import',
  'recurring',
  'closing',
  'reversal',
]);

function assertRepositoryPostingAllowed(authority: PostingAuthority): void {
  if (!ALLOWED_POSTING_CHANNELS.has(authority.channel)) {
    throw new Error(`Posting channel "${authority.channel as string}" is not allowed.`);
  }
}

// ── Read ───────────────────────────────────────────────────────────────────

export async function listPostedEntries(from?: string, to?: string): Promise<JournalEntry[]> {
  const prisma = getPrismaClient();
  const dateFilter: Record<string, Date> = {}
  if (from) dateFilter['gte'] = new Date(from)
  if (to) {
    const d = new Date(to)
    d.setHours(23, 59, 59, 999)
    dateFilter['lte'] = d
  }
  const rows = await prisma.journalEntry.findMany({
    where: {
      status: EntryStatus.Posted,
      ...(Object.keys(dateFilter).length ? { date: dateFilter } : {}),
    },
    include: INCLUDE_LINES,
    orderBy: { date: 'desc' },
  });
  return (rows as unknown as PrismaJournalEntry[]).map(toCoreJournalEntry);
}

export async function listDraftEntries(): Promise<JournalEntry[]> {
  const prisma = getPrismaClient();
  const rows = await prisma.journalEntry.findMany({
    where: { status: EntryStatus.Draft },
    include: INCLUDE_LINES,
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
  });
  return (rows as unknown as PrismaJournalEntry[]).map(toCoreJournalEntry);
}

export async function findEntryById(id: string): Promise<JournalEntry | null> {
  const prisma = getPrismaClient();
  const row = await prisma.journalEntry.findUnique({ where: { id }, include: INCLUDE_LINES });
  if (!row) return null;
  return toCoreJournalEntry(row as unknown as PrismaJournalEntry);
}

// ── Ledger bootstrap (replay pattern) ─────────────────────────────────────
// Loads all posted entries from the database in creation order and applies
// them to a fresh Ledger. Called once at server startup. The Ledger is then
// kept live in memory for the duration of the process.

export async function loadLedger(): Promise<Ledger> {
  const entries = await listPostedEntries();
  const ledger = new Ledger();
  for (const entry of entries) {
    ledger.applyEntry(entry);
    ledger.postedEntries.push(entry);
  }
  return ledger;
}

// ── Draft persistence ──────────────────────────────────────────────────────

export async function createDraftEntry(entry: JournalEntry): Promise<JournalEntry> {
  const prisma = getPrismaClient();
  const data = toDbJournalEntry({ ...entry, status: EntryStatus.Draft });
  const row = await prisma.journalEntry.create({
    data: data as Parameters<typeof prisma.journalEntry.create>[0]['data'],
    include: INCLUDE_LINES,
  });
  return toCoreJournalEntry(row as unknown as PrismaJournalEntry);
}

export async function updateDraftEntry(id: string, entry: JournalEntry): Promise<JournalEntry> {
  const prisma = getPrismaClient();
  const row = await prisma.journalEntry.update({
    where: { id },
    data: {
      date: entry.date,
      memo: entry.memo,
      paymentMethod: entry.paymentMethod ?? null,
      lines: {
        deleteMany: {},
        create: entry.lines.map((line) => ({
          accountId: line.accountId,
          amount: toDbCents(line.amount),
          type: line.type,
        })) as unknown as Parameters<typeof prisma.journalLine.create>[0]['data'][],
      },
    } as Parameters<typeof prisma.journalEntry.update>[0]['data'],
    include: INCLUDE_LINES,
  });
  return toCoreJournalEntry(row as unknown as PrismaJournalEntry);
}

export async function deleteDraftEntry(id: string): Promise<void> {
  const prisma = getPrismaClient();
  await prisma.journalEntry.delete({ where: { id } });
}

// ── Post a draft ───────────────────────────────────────────────────────────
// Runs the core postEntry engine function, persists the result, and keeps
// the in-memory Ledger in sync by updating the entry's ID to the DB-assigned
// cuid (postEntry assigns a temporary numeric ID from the ledger counter).

export type PostPersistedResult =
  | { posted: true; entry: JournalEntry }
  | { posted: false; errors: ValidationError[] };

export async function postDraftEntry(
  draft: JournalEntry,
  chartOfAccounts: Account[],
  ledger: Ledger,
  authority: PostingAuthority
): Promise<PostPersistedResult> {
  assertRepositoryPostingAllowed(authority);

  const entryDate = new Date(draft.date);
  const locked = await isPeriodClosed(entryDate.getFullYear(), entryDate.getMonth() + 1);
  if (locked) {
    throw new Error(
      `Period ${entryDate.getFullYear()}-${String(entryDate.getMonth() + 1).padStart(2, '0')} is closed.`
    );
  }

  const result = postEntry(draft, chartOfAccounts, ledger);
  if (!result.posted) {
    return result;
  }

  const prisma = getPrismaClient();

  // The draft already exists in DB with its cuid. Update the status in-place
  // rather than creating a new record — this keeps the DB ID stable.
  await prisma.journalEntry.update({
    where: { id: draft.id! },
    data: { status: EntryStatus.Posted } as Parameters<typeof prisma.journalEntry.update>[0]['data'],
  });

  // postEntry assigned a temporary numeric ID from the ledger counter;
  // sync it back to the original draft cuid so that reverseEntry can find
  // this entry by the same ID the client already knows.
  result.entry.id = draft.id;

  return { posted: true, entry: result.entry };
}
