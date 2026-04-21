import { Account } from '../types/account.js';
import { EntryStatus, JournalEntry } from '../types/journal.js';
import { ValidationError, validateEntry } from '../validation/entry.js';
import { Ledger } from './ledger.js';

export type PostResult =
  | { posted: true; entry: JournalEntry }
  | { posted: false; errors: ValidationError[] };

export type DraftResult =
  | { saved: true; entry: JournalEntry }
  | { saved: false; errors: ValidationError[] };

// Minimal validation for drafts: at least one line and a parseable date.
function validateDraft(entry: JournalEntry): ValidationError[] {
  const errors: ValidationError[] = [];
  if (!entry.lines || entry.lines.length < 1) {
    errors.push({ rule: 'minimum_lines', message: 'A draft entry must have at least one line.' });
  }
  const t = entry.date instanceof Date ? entry.date.getTime() : NaN;
  if (isNaN(t)) {
    errors.push({ rule: 'invalid_date', message: 'The entry date is invalid.' });
  }
  return errors;
}

export function saveDraft(entry: JournalEntry): DraftResult {
  const errors = validateDraft(entry);
  if (errors.length > 0) {
    return { saved: false, errors };
  }
  // Return a new object; never mutate the caller's entry.
  const draft: JournalEntry = { ...entry, status: EntryStatus.Draft, id: undefined };
  return { saved: true, entry: draft };
}

export function postEntry(
  entry: JournalEntry,
  chartOfAccounts: Account[],
  ledger: Ledger
): PostResult {
  if (entry.status === EntryStatus.Posted) {
    return {
      posted: false,
      errors: [{ rule: 'already_posted', message: 'This entry has already been posted.' }],
    };
  }

  const result = validateEntry(entry, chartOfAccounts);
  if (!result.valid) {
    return { posted: false, errors: result.errors };
  }

  // Deep-copy lines so the posted ledger record can't be corrupted by
  // a caller that mutates their draft entry object after posting.
  const posted: JournalEntry = {
    ...entry,
    id: String(ledger.nextEntryId++),
    status: EntryStatus.Posted,
    lines: entry.lines.map((line) => ({ ...line })),
  };

  ledger.applyEntry(posted);
  ledger.postedEntries.push(posted);

  return { posted: true, entry: posted };
}

export function reverseEntry(
  originalId: string,
  date: Date,
  ledger: Ledger,
  chartOfAccounts: Account[]
): PostResult {
  const original = ledger.postedEntries.find((e: JournalEntry) => e.id === originalId);
  if (!original) {
    return {
      posted: false,
      errors: [{ rule: 'not_found', message: `No posted entry found with id "${originalId}".` }],
    };
  }

  // Prevent chaining reversals — reversing a reversal would silently restore the
  // original entry without a clear audit trail.
  if (original.reversalOf !== undefined) {
    return {
      posted: false,
      errors: [
        {
          rule: 'reversal_of_reversal',
          message: `Entry "${originalId}" is itself a reversal. Reverse the original entry instead.`,
        },
      ],
    };
  }

  const reversal: JournalEntry = {
    date,
    memo: `Reversal of entry #${originalId}`,
    status: EntryStatus.Draft,
    reversalOf: originalId,
    lines: original.lines.map((line) => ({
      ...line,
      type: line.type === 'debit' ? 'credit' : 'debit',
    })),
  };

  return postEntry(reversal, chartOfAccounts, ledger);
}
