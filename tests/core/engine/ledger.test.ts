import { describe, it, expect, beforeEach } from 'vitest';
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

const accruedRevenue: Account = {
  id: 'accrued_revenue',
  number: '4000',
  name: 'Accrued Revenue',
  type: AccountType.Revenue,
  normalBalance: 'credit',
  isContra: false,
};

const accumDepreciation: Account = {
  id: 'accum_dep',
  number: '1500',
  name: 'Accumulated Depreciation',
  type: AccountType.Asset,
  normalBalance: 'credit',
  isContra: true,
  contraTo: AccountType.Asset,
};

const chart: Account[] = [cash, accruedRevenue, accumDepreciation];

function postedEntry(lines: JournalEntry['lines'], id: string): JournalEntry {
  return {
    id,
    date: new Date('2024-01-01'),
    memo: 'test',
    status: EntryStatus.Posted,
    lines,
  };
}

describe('Ledger', () => {
  let ledger: Ledger;

  beforeEach(() => {
    ledger = new Ledger();
  });

  it('starts with zero balances', () => {
    expect(ledger.getRawBalance('cash')).toEqual({ debit: 0, credit: 0 });
    expect(ledger.getBalance('cash', chart)).toBe(0);
  });

  it('accumulates debits for a debit-normal account', () => {
    ledger.applyEntry(
      postedEntry(
        [
          { accountId: 'cash', amount: 500, type: 'debit' },
          { accountId: 'accrued_revenue', amount: 500, type: 'credit' },
        ],
        '1'
      )
    );
    expect(ledger.getBalance('cash', chart)).toBe(500);
  });

  it('accumulates credits for a credit-normal account', () => {
    ledger.applyEntry(
      postedEntry(
        [
          { accountId: 'cash', amount: 200, type: 'debit' },
          { accountId: 'accrued_revenue', amount: 200, type: 'credit' },
        ],
        '1'
      )
    );
    expect(ledger.getBalance('accrued_revenue', chart)).toBe(200);
  });

  it('accumulates credits for a contra-asset (credit-normal)', () => {
    ledger.applyEntry(
      postedEntry(
        [
          { accountId: 'accum_dep', amount: 100, type: 'credit' },
          { accountId: 'cash', amount: 100, type: 'debit' },
        ],
        '1'
      )
    );
    // Contra-asset has credit normal balance; a credit of 100 is positive balance.
    expect(ledger.getBalance('accum_dep', chart)).toBe(100);
  });

  it('returns a negative balance when account is on the wrong side (abnormal balance)', () => {
    // Credit cash — debit-normal account receiving a credit produces a negative balance.
    ledger.applyEntry(
      postedEntry(
        [
          { accountId: 'cash', amount: 300, type: 'credit' },
          { accountId: 'accrued_revenue', amount: 300, type: 'debit' },
        ],
        '1'
      )
    );
    expect(ledger.getBalance('cash', chart)).toBe(-300);
  });

  it('returns 0 for an unknown account id', () => {
    expect(ledger.getBalance('nonexistent', chart)).toBe(0);
  });

  it('sums multiple entries for the same account', () => {
    ledger.applyEntry(
      postedEntry([{ accountId: 'cash', amount: 100, type: 'debit' }, { accountId: 'accrued_revenue', amount: 100, type: 'credit' }], '1')
    );
    ledger.applyEntry(
      postedEntry([{ accountId: 'cash', amount: 50, type: 'debit' }, { accountId: 'accrued_revenue', amount: 50, type: 'credit' }], '2')
    );
    expect(ledger.getBalance('cash', chart)).toBe(150);
  });

  describe('buildBalancesAsOf', () => {
    it('only includes entries on or before the asOf date', () => {
      const entry1: JournalEntry = {
        id: '1',
        date: new Date('2024-01-01'),
        memo: 'jan',
        status: EntryStatus.Posted,
        lines: [
          { accountId: 'cash', amount: 100, type: 'debit' },
          { accountId: 'accrued_revenue', amount: 100, type: 'credit' },
        ],
      };
      const entry2: JournalEntry = {
        id: '2',
        date: new Date('2024-06-01'),
        memo: 'jun',
        status: EntryStatus.Posted,
        lines: [
          { accountId: 'cash', amount: 200, type: 'debit' },
          { accountId: 'accrued_revenue', amount: 200, type: 'credit' },
        ],
      };
      ledger.postedEntries.push(entry1, entry2);
      const snapshot = ledger.buildBalancesAsOf(new Date('2024-03-01'));
      const cashBalance = snapshot.get('cash') ?? { debit: 0, credit: 0 };
      expect(cashBalance.debit).toBe(100);
    });
  });
});
