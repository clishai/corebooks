import { Account, AccountType } from '../core/types/account.js';
import { EntryStatus, JournalEntry, JournalLine } from '../core/types/journal.js';

// ── Prisma result shapes ───────────────────────────────────────────────────
// Plain object interfaces matching the rows returned by Prisma queries.
// Defined here to avoid importing the complex generated runtime types.

export interface PrismaAccount {
  id: string;
  number: string;
  name: string;
  type: string;
  normalBalance: string;
  isContra: boolean;
  contraTo: string | null;
}

export interface PrismaJournalLine {
  id: string;
  entryId: string;
  accountId: string;
  amount: number; // integer cents
  type: string;
}

export interface PrismaJournalEntry {
  id: string;
  date: Date;
  memo: string;
  status: string;
  paymentMethod: string | null;
  reversalOf: string | null;
  lines: PrismaJournalLine[];
}

// ── Amount conversion ──────────────────────────────────────────────────────
// Sole place where cents ↔ number conversion happens.

export function toCoreAmount(cents: number): number {
  return cents / 100;
}

export function toDbCents(amount: number): number {
  return Math.round(amount * 100);
}

// ── Account ────────────────────────────────────────────────────────────────

export function toCoreAccount(row: PrismaAccount): Account {
  return {
    id: row.id,
    number: row.number,
    name: row.name,
    type: row.type as AccountType,
    normalBalance: row.normalBalance as 'debit' | 'credit',
    isContra: row.isContra,
    contraTo: row.contraTo != null ? (row.contraTo as AccountType) : undefined,
  };
}

// Returns a create-data shape for prisma.account.create().
// Prisma's generated enum types are string literal unions structurally
// identical to the core enum values; a cast at the repository call site is
// used instead of polluting this layer with generated type imports.
export function toDbAccount(account: Account): Record<string, unknown> {
  return {
    ...(account.id ? { id: account.id } : {}),
    number: account.number,
    name: account.name,
    type: account.type,
    normalBalance: account.normalBalance,
    isContra: account.isContra,
    contraTo: account.contraTo ?? null,
  };
}

// ── JournalEntry ───────────────────────────────────────────────────────────

function toCoreJournalLine(row: PrismaJournalLine): JournalLine {
  return {
    accountId: row.accountId,
    amount: toCoreAmount(row.amount),
    type: row.type as 'debit' | 'credit',
  };
}

export function toCoreJournalEntry(row: PrismaJournalEntry): JournalEntry {
  return {
    id: row.id,
    date: row.date,
    memo: row.memo,
    status: row.status as EntryStatus,
    paymentMethod: row.paymentMethod ?? undefined,
    reversalOf: row.reversalOf ?? undefined,
    lines: row.lines.map(toCoreJournalLine),
  };
}

// Returns an unchecked create-data shape for prisma.journalEntry.create().
export function toDbJournalEntry(entry: JournalEntry): Record<string, unknown> {
  return {
    ...(entry.id ? { id: entry.id } : {}),
    date: entry.date,
    memo: entry.memo,
    status: entry.status,
    paymentMethod: entry.paymentMethod ?? null,
    reversalOf: entry.reversalOf ?? null,
    lines: {
      create: entry.lines.map((line) => ({
        accountId: line.accountId,
        amount: toDbCents(line.amount),
        type: line.type,
      })),
    },
  };
}
