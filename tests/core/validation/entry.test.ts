import { describe, it, expect } from 'vitest';
import { validateEntry } from '../../../src/core/validation/entry.js';
import { Account, AccountType } from '../../../src/core/types/account.js';
import { EntryStatus, JournalEntry } from '../../../src/core/types/journal.js';

const cash: Account = {
  id: 'cash',
  number: '1000',
  name: 'Cash',
  type: AccountType.Asset,
  normalBalance: 'debit',
  isContra: false,
};

const revenue: Account = {
  id: 'revenue',
  number: '4000',
  name: 'Sales Revenue',
  type: AccountType.Revenue,
  normalBalance: 'credit',
  isContra: false,
};

const chart: Account[] = [cash, revenue];

function baseEntry(overrides: Partial<JournalEntry> = {}): JournalEntry {
  return {
    date: new Date('2024-06-15'),
    memo: 'Test entry',
    status: EntryStatus.Draft,
    lines: [
      { accountId: 'cash', amount: 100, type: 'debit' },
      { accountId: 'revenue', amount: 100, type: 'credit' },
    ],
    ...overrides,
  };
}

describe('validateEntry', () => {
  it('returns valid for a well-formed balanced entry', () => {
    expect(validateEntry(baseEntry(), chart)).toEqual({ valid: true });
  });

  it('fails when fewer than two lines', () => {
    const result = validateEntry(baseEntry({ lines: [{ accountId: 'cash', amount: 100, type: 'debit' }] }), chart);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors.some((e) => e.rule === 'minimum_lines')).toBe(true);
    }
  });

  it('fails when a line references an unknown account', () => {
    const result = validateEntry(
      baseEntry({
        lines: [
          { accountId: 'unknown', amount: 100, type: 'debit' },
          { accountId: 'revenue', amount: 100, type: 'credit' },
        ],
      }),
      chart
    );
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors.some((e) => e.rule === 'unknown_account')).toBe(true);
    }
  });

  it('fails when an amount is zero', () => {
    const result = validateEntry(
      baseEntry({
        lines: [
          { accountId: 'cash', amount: 0, type: 'debit' },
          { accountId: 'revenue', amount: 0, type: 'credit' },
        ],
      }),
      chart
    );
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors.some((e) => e.rule === 'invalid_amount')).toBe(true);
    }
  });

  it('fails when an amount is negative', () => {
    const result = validateEntry(
      baseEntry({
        lines: [
          { accountId: 'cash', amount: -50, type: 'debit' },
          { accountId: 'revenue', amount: 100, type: 'credit' },
        ],
      }),
      chart
    );
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors.some((e) => e.rule === 'invalid_amount')).toBe(true);
    }
  });

  it('fails when debits do not equal credits', () => {
    const result = validateEntry(
      baseEntry({
        lines: [
          { accountId: 'cash', amount: 100, type: 'debit' },
          { accountId: 'revenue', amount: 90, type: 'credit' },
        ],
      }),
      chart
    );
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors.some((e) => e.rule === 'unbalanced')).toBe(true);
    }
  });

  it('fails when the date is before 1900', () => {
    const result = validateEntry(baseEntry({ date: new Date('1800-01-01') }), chart);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors.some((e) => e.rule === 'invalid_date')).toBe(true);
    }
  });

  it('fails when the date is more than 10 years in the future', () => {
    const farFuture = new Date();
    farFuture.setFullYear(farFuture.getFullYear() + 11);
    const result = validateEntry(baseEntry({ date: farFuture }), chart);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors.some((e) => e.rule === 'invalid_date')).toBe(true);
    }
  });

  it('accumulates multiple errors at once', () => {
    const result = validateEntry(
      {
        date: new Date('1800-01-01'),
        memo: 'bad',
        status: EntryStatus.Draft,
        lines: [{ accountId: 'cash', amount: -1, type: 'debit' }],
      },
      chart
    );
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors.length).toBeGreaterThan(1);
    }
  });
});
