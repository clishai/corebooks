import { Account } from '../types/account.js';
import { JournalEntry } from '../types/journal.js';

export interface RawBalance {
  debit: number;
  credit: number;
}

export class Ledger {
  private balances: Map<string, RawBalance> = new Map();
  readonly postedEntries: JournalEntry[] = [];
  nextEntryId: number = 1;

  // Shared inner loop used by applyEntry, buildBalancesAsOf, and buildBalancesInRange.
  private static applyLines(
    lines: JournalEntry['lines'],
    snapshot: Map<string, RawBalance>,
  ): void {
    for (const line of lines) {
      const cur = snapshot.get(line.accountId) ?? { debit: 0, credit: 0 };
      snapshot.set(
        line.accountId,
        line.type === 'debit'
          ? { debit: cur.debit + line.amount, credit: cur.credit }
          : { debit: cur.debit, credit: cur.credit + line.amount },
      );
    }
  }

  applyEntry(entry: JournalEntry): void {
    Ledger.applyLines(entry.lines, this.balances);
  }

  getRawBalance(accountId: string): RawBalance {
    return this.balances.get(accountId) ?? { debit: 0, credit: 0 };
  }

  // Returns a signed balance: positive means the account is on its normal side.
  // Debit-normal: positive = net debit; credit-normal: positive = net credit.
  // Abnormal (negative) balances are legal — the engine never rejects them.
  getBalance(accountId: string, chartOfAccounts: Account[]): number {
    const account = chartOfAccounts.find((a: Account) => a.id === accountId);
    if (!account) return 0;
    const { debit, credit } = this.getRawBalance(accountId);
    return account.normalBalance === 'debit' ? debit - credit : credit - debit;
  }

  // Rebuilds balances from postedEntries filtered to entries on or before `asOf`.
  // Used by date-scoped reports; does not mutate the live ledger.
  buildBalancesAsOf(asOf: Date): Map<string, RawBalance> {
    const snapshot = new Map<string, RawBalance>();
    for (const entry of this.postedEntries) {
      if (entry.date <= asOf) Ledger.applyLines(entry.lines, snapshot);
    }
    return snapshot;
  }

  // Rebuilds balances from entries within [from, to] inclusive. Used by income statement.
  buildBalancesInRange(from: Date, to: Date): Map<string, RawBalance> {
    const snapshot = new Map<string, RawBalance>();
    for (const entry of this.postedEntries) {
      if (entry.date >= from && entry.date <= to) Ledger.applyLines(entry.lines, snapshot);
    }
    return snapshot;
  }

  reset(): void {
    this.balances.clear();
    this.postedEntries.splice(0);
    this.nextEntryId = 1;
  }
}
