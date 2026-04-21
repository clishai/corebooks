import { describe, it, expect, beforeEach } from 'vitest';
import { trialBalance, balanceSheet, incomeStatement } from '../../../src/core/engine/reporting.js';
import { postEntry } from '../../../src/core/engine/entries.js';
import { Ledger } from '../../../src/core/engine/ledger.js';
import { Account, AccountType } from '../../../src/core/types/account.js';
import { EntryStatus, JournalEntry } from '../../../src/core/types/journal.js';

const cash: Account = { id: 'cash', number: '1000', name: 'Cash', type: AccountType.Asset, normalBalance: 'debit', isContra: false };
const equipment: Account = { id: 'equipment', number: '1200', name: 'Equipment', type: AccountType.Asset, normalBalance: 'debit', isContra: false };
const accumDep: Account = { id: 'accum_dep', number: '1210', name: 'Accumulated Depreciation', type: AccountType.Asset, normalBalance: 'credit', isContra: true, contraTo: AccountType.Asset };
const accountsPayable: Account = { id: 'ap', number: '2000', name: 'Accounts Payable', type: AccountType.Liability, normalBalance: 'credit', isContra: false };
const equity: Account = { id: 'equity', number: '3000', name: "Owner's Equity", type: AccountType.Equity, normalBalance: 'credit', isContra: false };
const salesRevenue: Account = { id: 'sales', number: '4000', name: 'Sales Revenue', type: AccountType.Revenue, normalBalance: 'credit', isContra: false };
const rentExpense: Account = { id: 'rent', number: '5000', name: 'Rent Expense', type: AccountType.Expense, normalBalance: 'debit', isContra: false };

const chart: Account[] = [cash, equipment, accumDep, accountsPayable, equity, salesRevenue, rentExpense];

function draft(lines: JournalEntry['lines'], date = '2024-06-15'): JournalEntry {
  return { date: new Date(date), memo: 'test', status: EntryStatus.Draft, lines };
}

describe('trialBalance', () => {
  it('totals are zero for an empty ledger', () => {
    const ledger = new Ledger();
    const tb = trialBalance(ledger, chart);
    expect(tb.totalDebits).toBe(0);
    expect(tb.totalCredits).toBe(0);
    expect(tb.balanced).toBe(true);
  });

  it('debits equal credits after a balanced post', () => {
    const ledger = new Ledger();
    postEntry(
      draft([
        { accountId: 'cash', amount: 1000, type: 'debit' },
        { accountId: 'equity', amount: 1000, type: 'credit' },
      ]),
      chart,
      ledger
    );
    const tb = trialBalance(ledger, chart);
    expect(tb.balanced).toBe(true);
    expect(tb.totalDebits).toBe(1000);
    expect(tb.totalCredits).toBe(1000);
  });

  it('includes all chart accounts as rows', () => {
    const ledger = new Ledger();
    const tb = trialBalance(ledger, chart);
    expect(tb.rows).toHaveLength(chart.length);
  });
});

describe('balanceSheet', () => {
  let ledger: Ledger;

  beforeEach(() => {
    ledger = new Ledger();
    // Opening equity contribution: debit Cash, credit Equity
    postEntry(
      draft([
        { accountId: 'cash', amount: 5000, type: 'debit' },
        { accountId: 'equity', amount: 5000, type: 'credit' },
      ]),
      chart,
      ledger
    );
    // Buy equipment on credit: debit Equipment, credit AP
    postEntry(
      draft([
        { accountId: 'equipment', amount: 3000, type: 'debit' },
        { accountId: 'ap', amount: 3000, type: 'credit' },
      ]),
      chart,
      ledger
    );
  });

  it('satisfies Assets = Liabilities + Equity', () => {
    const bs = balanceSheet(ledger, chart, new Date('2024-12-31'));
    expect(bs.balanced).toBe(true);
    expect(bs.assets).toBe(bs.liabilities + bs.equity);
  });

  it('nets contra-asset against assets', () => {
    // Snapshot assets before depreciation (5000 cash + 3000 equipment = 8000)
    const bsBefore = balanceSheet(ledger, chart, new Date('2024-12-31'));

    // Record depreciation: debit Rent Expense, credit Accumulated Depreciation
    postEntry(
      draft([
        { accountId: 'rent', amount: 500, type: 'debit' },
        { accountId: 'accum_dep', amount: 500, type: 'credit' },
      ]),
      chart,
      ledger
    );
    const bsAfter = balanceSheet(ledger, chart, new Date('2024-12-31'));

    // Contra-asset nets against total assets: 8000 - 500 = 7500
    expect(bsAfter.assets).toBe(bsBefore.assets - 500);
    // Accounting equation still holds
    expect(bsAfter.balanced).toBe(true);
  });

  it('asOf parameter excludes future entries', () => {
    // Post a future entry
    postEntry(
      draft(
        [
          { accountId: 'cash', amount: 1000, type: 'debit' },
          { accountId: 'equity', amount: 1000, type: 'credit' },
        ],
        '2025-03-01'
      ),
      chart,
      ledger
    );
    const bs2024 = balanceSheet(ledger, chart, new Date('2024-12-31'));
    const bs2025 = balanceSheet(ledger, chart, new Date('2025-12-31'));
    expect(bs2025.assets).toBeGreaterThan(bs2024.assets);
  });
});

describe('incomeStatement', () => {
  let ledger: Ledger;

  beforeEach(() => {
    ledger = new Ledger();
    // Cash sale: debit Cash, credit Sales Revenue
    postEntry(
      draft([
        { accountId: 'cash', amount: 2000, type: 'debit' },
        { accountId: 'sales', amount: 2000, type: 'credit' },
      ]),
      chart,
      ledger
    );
    // Rent expense: debit Rent Expense, credit Cash
    postEntry(
      draft([
        { accountId: 'rent', amount: 800, type: 'debit' },
        { accountId: 'cash', amount: 800, type: 'credit' },
      ]),
      chart,
      ledger
    );
  });

  it('net income = revenue - expenses', () => {
    const is = incomeStatement(ledger, chart, new Date('2024-01-01'), new Date('2024-12-31'));
    expect(is.revenue).toBe(2000);
    expect(is.expenses).toBe(800);
    expect(is.netIncome).toBe(1200);
  });

  it('returns zeros outside the date range', () => {
    const is = incomeStatement(ledger, chart, new Date('2023-01-01'), new Date('2023-12-31'));
    expect(is.revenue).toBe(0);
    expect(is.expenses).toBe(0);
    expect(is.netIncome).toBe(0);
  });
});
