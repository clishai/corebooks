import { describe, it, expect, beforeEach } from 'vitest';
import { postEntry, reverseEntry } from '../../../src/core/engine/entries.js';
import { balanceSheet } from '../../../src/core/engine/reporting.js';
import { trialBalance } from '../../../src/core/engine/reporting.js';
import { Ledger } from '../../../src/core/engine/ledger.js';
import { Account, AccountType } from '../../../src/core/types/account.js';
import { EntryStatus, JournalEntry } from '../../../src/core/types/journal.js';

// Full chart of accounts for an integration scenario
const cash: Account = { id: 'cash', number: '1000', name: 'Cash', type: AccountType.Asset, normalBalance: 'debit', isContra: false };
const equipment: Account = { id: 'equipment', number: '1200', name: 'Equipment', type: AccountType.Asset, normalBalance: 'debit', isContra: false };
const accumDep: Account = { id: 'accum_dep', number: '1210', name: 'Accumulated Depreciation', type: AccountType.Asset, normalBalance: 'credit', isContra: true, contraTo: AccountType.Asset };
const ap: Account = { id: 'ap', number: '2000', name: 'Accounts Payable', type: AccountType.Liability, normalBalance: 'credit', isContra: false };
const ownerEquity: Account = { id: 'equity', number: '3000', name: "Owner's Equity", type: AccountType.Equity, normalBalance: 'credit', isContra: false };
const sales: Account = { id: 'sales', number: '4000', name: 'Sales Revenue', type: AccountType.Revenue, normalBalance: 'credit', isContra: false };
const rentExpense: Account = { id: 'rent', number: '5000', name: 'Rent Expense', type: AccountType.Expense, normalBalance: 'debit', isContra: false };

const chart: Account[] = [cash, equipment, accumDep, ap, ownerEquity, sales, rentExpense];

function draft(lines: JournalEntry['lines'], date = '2024-06-15'): JournalEntry {
  return { date: new Date(date), memo: 'integration', status: EntryStatus.Draft, lines };
}

function assertEquation(ledger: Ledger, label: string): void {
  const bs = balanceSheet(ledger, chart, new Date('2099-12-31'));
  expect(bs.balanced, `Accounting equation violated after: ${label}`).toBe(true);
}

describe('Accounting equation invariant', () => {
  let ledger: Ledger;

  beforeEach(() => {
    ledger = new Ledger();
  });

  it('holds after a full sequence of posts including a reversal', () => {
    // 1. Owner contributes $10,000 cash
    const r1 = postEntry(
      draft([
        { accountId: 'cash', amount: 10000, type: 'debit' },
        { accountId: 'equity', amount: 10000, type: 'credit' },
      ]),
      chart,
      ledger
    );
    expect(r1.posted).toBe(true);
    assertEquation(ledger, 'opening equity contribution');

    // 2. Buy equipment for $4,000 on credit
    const r2 = postEntry(
      draft([
        { accountId: 'equipment', amount: 4000, type: 'debit' },
        { accountId: 'ap', amount: 4000, type: 'credit' },
      ]),
      chart,
      ledger
    );
    expect(r2.posted).toBe(true);
    assertEquation(ledger, 'equipment purchase on credit');

    // 3. Cash sale of $2,500
    const r3 = postEntry(
      draft([
        { accountId: 'cash', amount: 2500, type: 'debit' },
        { accountId: 'sales', amount: 2500, type: 'credit' },
      ]),
      chart,
      ledger
    );
    expect(r3.posted).toBe(true);
    assertEquation(ledger, 'cash sale');

    // 4. Record depreciation: $800 (debit Rent Expense, credit Accumulated Depreciation)
    const r4 = postEntry(
      draft([
        { accountId: 'rent', amount: 800, type: 'debit' },
        { accountId: 'accum_dep', amount: 800, type: 'credit' },
      ]),
      chart,
      ledger
    );
    expect(r4.posted).toBe(true);
    assertEquation(ledger, 'depreciation entry');

    // 5. Reverse the cash sale (entry #3)
    if (!r3.posted) throw new Error('r3 not posted');
    const r5 = reverseEntry(r3.entry.id!, new Date('2024-08-01'), ledger, chart);
    expect(r5.posted).toBe(true);
    assertEquation(ledger, 'reversal of cash sale');

    // Final trial balance check: debits must equal credits across the entire ledger
    const tb = trialBalance(ledger, chart);
    expect(tb.balanced).toBe(true);
    expect(tb.totalDebits).toBe(tb.totalCredits);
  });

  it('equation holds with zero activity', () => {
    assertEquation(ledger, 'empty ledger');
  });
});
