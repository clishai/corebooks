import { describe, it, expect, beforeEach } from 'vitest';
import { saveDraft, postEntry, reverseEntry } from '../../../src/core/engine/entries.js';
import { Ledger } from '../../../src/core/engine/ledger.js';
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

function draftEntry(overrides: Partial<JournalEntry> = {}): JournalEntry {
  return {
    date: new Date('2024-06-15'),
    memo: 'Test sale',
    status: EntryStatus.Draft,
    lines: [
      { accountId: 'cash', amount: 250, type: 'debit' },
      { accountId: 'revenue', amount: 250, type: 'credit' },
    ],
    ...overrides,
  };
}

describe('saveDraft', () => {
  it('returns a Draft entry with no id', () => {
    const result = saveDraft(draftEntry());
    expect(result.saved).toBe(true);
    if (result.saved) {
      expect(result.entry.status).toBe(EntryStatus.Draft);
      expect(result.entry.id).toBeUndefined();
    }
  });

  it('does not mutate the input entry', () => {
    const input = draftEntry({ id: 'should-be-cleared' });
    const result = saveDraft(input);
    expect(result.saved).toBe(true);
    // Input should be untouched.
    expect(input.id).toBe('should-be-cleared');
  });

  it('fails when there are no lines', () => {
    const result = saveDraft(draftEntry({ lines: [] }));
    expect(result.saved).toBe(false);
    if (!result.saved) {
      expect(result.errors.some((e) => e.rule === 'minimum_lines')).toBe(true);
    }
  });

  it('fails when the date is invalid', () => {
    const result = saveDraft(draftEntry({ date: new Date('not-a-date') }));
    expect(result.saved).toBe(false);
    if (!result.saved) {
      expect(result.errors.some((e) => e.rule === 'invalid_date')).toBe(true);
    }
  });

  it('accepts an unbalanced entry as a draft', () => {
    const result = saveDraft(
      draftEntry({
        lines: [{ accountId: 'cash', amount: 100, type: 'debit' }],
      })
    );
    // Only one line — saveDraft requires at least one line (not two), so this should save.
    expect(result.saved).toBe(true);
  });
});

describe('postEntry', () => {
  let ledger: Ledger;

  beforeEach(() => {
    ledger = new Ledger();
  });

  it('posts a valid entry, assigns a sequential id, and marks it Posted', () => {
    const result = postEntry(draftEntry(), chart, ledger);
    expect(result.posted).toBe(true);
    if (result.posted) {
      expect(result.entry.id).toBe('1');
      expect(result.entry.status).toBe(EntryStatus.Posted);
    }
  });

  it('assigns incrementing ids across multiple posts', () => {
    const r1 = postEntry(draftEntry(), chart, ledger);
    const r2 = postEntry(draftEntry(), chart, ledger);
    expect(r1.posted && r1.entry.id).toBe('1');
    expect(r2.posted && r2.entry.id).toBe('2');
  });

  it('appends the posted entry to the ledger', () => {
    postEntry(draftEntry(), chart, ledger);
    expect(ledger.postedEntries).toHaveLength(1);
    expect(ledger.postedEntries[0].status).toBe(EntryStatus.Posted);
  });

  it('updates ledger balances after posting', () => {
    postEntry(draftEntry(), chart, ledger);
    expect(ledger.getBalance('cash', chart)).toBe(250);
    expect(ledger.getBalance('revenue', chart)).toBe(250);
  });

  it('rejects an already-posted entry', () => {
    const r1 = postEntry(draftEntry(), chart, ledger);
    if (!r1.posted) throw new Error('setup failed');
    const r2 = postEntry(r1.entry, chart, ledger);
    expect(r2.posted).toBe(false);
    if (!r2.posted) {
      expect(r2.errors.some((e) => e.rule === 'already_posted')).toBe(true);
    }
  });

  it('rejects an unbalanced entry with structured errors', () => {
    const result = postEntry(
      draftEntry({
        lines: [
          { accountId: 'cash', amount: 100, type: 'debit' },
          { accountId: 'revenue', amount: 90, type: 'credit' },
        ],
      }),
      chart,
      ledger
    );
    expect(result.posted).toBe(false);
    if (!result.posted) {
      expect(result.errors.some((e) => e.rule === 'unbalanced')).toBe(true);
    }
  });

  it('rejects an entry with an unknown account', () => {
    const result = postEntry(
      draftEntry({
        lines: [
          { accountId: 'ghost', amount: 100, type: 'debit' },
          { accountId: 'revenue', amount: 100, type: 'credit' },
        ],
      }),
      chart,
      ledger
    );
    expect(result.posted).toBe(false);
  });
});

describe('reverseEntry', () => {
  let ledger: Ledger;

  beforeEach(() => {
    ledger = new Ledger();
  });

  it('creates an equal and opposite entry and posts it', () => {
    const r1 = postEntry(draftEntry(), chart, ledger);
    if (!r1.posted) throw new Error('setup failed');

    const r2 = reverseEntry(r1.entry.id!, new Date('2024-07-01'), ledger, chart);
    expect(r2.posted).toBe(true);
    if (r2.posted) {
      expect(r2.entry.reversalOf).toBe(r1.entry.id);
      // Lines should be flipped
      const origLines = r1.entry.lines;
      const revLines = r2.entry.lines;
      for (let i = 0; i < origLines.length; i++) {
        expect(revLines[i].amount).toBe(origLines[i].amount);
        expect(revLines[i].type).not.toBe(origLines[i].type);
      }
    }
  });

  it('nets the ledger back toward zero after reversal', () => {
    const r1 = postEntry(draftEntry(), chart, ledger);
    if (!r1.posted) throw new Error('setup failed');
    reverseEntry(r1.entry.id!, new Date('2024-07-01'), ledger, chart);
    expect(ledger.getBalance('cash', chart)).toBe(0);
    expect(ledger.getBalance('revenue', chart)).toBe(0);
  });

  it('fails when the original id is not found', () => {
    const result = reverseEntry('nonexistent', new Date('2024-07-01'), ledger, chart);
    expect(result.posted).toBe(false);
    if (!result.posted) {
      expect(result.errors.some((e) => e.rule === 'not_found')).toBe(true);
    }
  });

  it('refuses to reverse a reversal entry', () => {
    const r1 = postEntry(draftEntry(), chart, ledger);
    if (!r1.posted) throw new Error('setup failed');
    const r2 = reverseEntry(r1.entry.id!, new Date('2024-07-01'), ledger, chart);
    if (!r2.posted) throw new Error('reversal failed');
    const r3 = reverseEntry(r2.entry.id!, new Date('2024-08-01'), ledger, chart);
    expect(r3.posted).toBe(false);
    if (!r3.posted) {
      expect(r3.errors.some((e) => e.rule === 'reversal_of_reversal')).toBe(true);
    }
  });

  it('does not modify the original entry', () => {
    const r1 = postEntry(draftEntry(), chart, ledger);
    if (!r1.posted) throw new Error('setup failed');
    const originalLines = JSON.stringify(r1.entry.lines);
    reverseEntry(r1.entry.id!, new Date('2024-07-01'), ledger, chart);
    expect(JSON.stringify(ledger.postedEntries[0].lines)).toBe(originalLines);
    expect(ledger.postedEntries[0].status).toBe(EntryStatus.Posted);
  });
});
