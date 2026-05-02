import { Account } from '../types/account.js';
import { JournalEntry, JournalLine } from '../types/journal.js';

export interface ValidationError {
  rule: string;
  message: string;
  lineIndex?: number;
}

export type ValidationResult =
  | { valid: true }
  | { valid: false; errors: ValidationError[] };

// Recomputed each call because MAX_DATE depends on the current year.
const MIN_DATE = new Date('1900-01-01').getTime();

export function validateEntry(
  entry: JournalEntry,
  chartOfAccounts: Account[]
): ValidationResult {
  const errors: ValidationError[] = [];

  // Rule 1: Minimum lines
  if (entry.lines.length < 2) {
    errors.push({ rule: 'minimum_lines', message: 'A journal entry must have at least two lines.' });
  }

  // Rules 2 & 3: Account existence and positive amounts — single pass over lines
  const accountIds = new Set(chartOfAccounts.map((a: Account) => a.id));
  entry.lines.forEach((line: JournalLine, index: number) => {
    if (!accountIds.has(line.accountId)) {
      errors.push({
        rule: 'unknown_account',
        message: `Line ${index} references unknown account "${line.accountId}".`,
        lineIndex: index,
      });
    }
    if (isNaN(line.amount) || line.amount <= 0) {
      errors.push({
        rule: 'invalid_amount',
        message: `Line ${index} has an invalid amount (${line.amount}). Amounts must be greater than zero.`,
        lineIndex: index,
      });
    }
  });

  // Rule 4: Debits equal credits — single loop instead of two filter+reduce chains
  let totalDebits = 0;
  let totalCredits = 0;
  for (const l of entry.lines) {
    if (l.type === 'debit') totalDebits += l.amount;
    else totalCredits += l.amount;
  }
  if (totalDebits !== totalCredits) {
    errors.push({
      rule: 'unbalanced',
      message: `Total debits (${totalDebits}) do not equal total credits (${totalCredits}).`,
    });
  }

  // Rule 5: Valid date range
  const MAX_DATE = new Date(new Date().getFullYear() + 10, 11, 31).getTime();
  const entryTime = entry.date instanceof Date ? entry.date.getTime() : NaN;
  if (isNaN(entryTime) || entryTime < MIN_DATE || entryTime > MAX_DATE) {
    errors.push({
      rule: 'invalid_date',
      message: `The entry date is invalid or outside the allowed range (1900-01-01 to ${new Date(MAX_DATE).toISOString().slice(0, 10)}).`,
    });
  }

  return errors.length > 0 ? { valid: false, errors } : { valid: true };
}
