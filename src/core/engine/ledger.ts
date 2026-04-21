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

  applyEntry(entry: JournalEntry): void {
    for (const line of entry.lines) {
      const current = this.balances.get(line.accountId) ?? { debit: 0, credit: 0 };
      if (line.type === 'debit') {
        this.balances.set(line.accountId, { debit: current.debit + line.amount, credit: current.credit });
      } else {
        this.balances.set(line.accountId, { debit: current.debit, credit: current.credit + line.amount });
      }
    }
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
    if (account.normalBalance === 'debit') {
      return debit - credit;
    }
    return credit - debit;
  }

  // Rebuilds balances from postedEntries filtered to entries on or before `asOf`.
  // Used by date-scoped reports; does not mutate the live ledger.
  buildBalancesAsOf(asOf: Date): Map<string, RawBalance> {
    const snapshot = new Map<string, RawBalance>();
    for (const entry of this.postedEntries) {
      if (entry.date <= asOf) {
        for (const line of entry.lines) {
          const current = snapshot.get(line.accountId) ?? { debit: 0, credit: 0 };
          if (line.type === 'debit') {
            snapshot.set(line.accountId, { debit: current.debit + line.amount, credit: current.credit });
          } else {
            snapshot.set(line.accountId, { debit: current.debit, credit: current.credit + line.amount });
          }
        }
      }
    }
    return snapshot;
  }

  // Rebuilds balances from entries within [from, to] inclusive. Used by income statement.
  buildBalancesInRange(from: Date, to: Date): Map<string, RawBalance> {
    const snapshot = new Map<string, RawBalance>();
    for (const entry of this.postedEntries) {
      if (entry.date >= from && entry.date <= to) {
        for (const line of entry.lines) {
          const current = snapshot.get(line.accountId) ?? { debit: 0, credit: 0 };
          if (line.type === 'debit') {
            snapshot.set(line.accountId, { debit: current.debit + line.amount, credit: current.credit });
          } else {
            snapshot.set(line.accountId, { debit: current.debit, credit: current.credit + line.amount });
          }
        }
      }
    }
    return snapshot;
  }
}
