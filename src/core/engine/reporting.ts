import { Account, AccountType } from '../types/account.js';
import { Ledger, RawBalance } from './ledger.js';

export interface TrialBalanceRow {
  account: Account;
  debit: number;
  credit: number;
}

export interface TrialBalance {
  rows: TrialBalanceRow[];
  totalDebits: number;
  totalCredits: number;
  balanced: boolean;
}

export interface BalanceSheet {
  assets: number;
  liabilities: number;
  equity: number;
  balanced: boolean;
}

export interface IncomeStatement {
  revenue: number;
  expenses: number;
  netIncome: number;
}

// Computes the net signed balance for an account from a raw balance snapshot,
// respecting normalBalance direction. Contra accounts are included on their own
// normal side — callers net them against the parent type.
function netBalance(account: Account, raw: RawBalance): number {
  if (account.normalBalance === 'debit') {
    return raw.debit - raw.credit;
  }
  return raw.credit - raw.debit;
}

export function trialBalance(ledger: Ledger, chartOfAccounts: Account[]): TrialBalance {
  let totalDebits = 0;
  let totalCredits = 0;
  const rows: TrialBalanceRow[] = [];

  for (const account of chartOfAccounts) {
    const raw = ledger.getRawBalance(account.id);
    totalDebits += raw.debit;
    totalCredits += raw.credit;
    rows.push({ account, debit: raw.debit, credit: raw.credit });
  }

  return {
    rows,
    totalDebits,
    totalCredits,
    balanced: totalDebits === totalCredits,
  };
}

export function balanceSheet(
  ledger: Ledger,
  chartOfAccounts: Account[],
  asOf: Date
): BalanceSheet {
  const snapshot = ledger.buildBalancesAsOf(asOf);

  let assets = 0;
  let liabilities = 0;
  let equity = 0;

  for (const account of chartOfAccounts) {
    const raw = snapshot.get(account.id) ?? { debit: 0, credit: 0 };
    const balance = netBalance(account, raw);

    if (account.isContra && account.contraTo !== undefined) {
      // Net contra accounts against their parent type.
      switch (account.contraTo) {
        case AccountType.Asset:
          assets -= balance;
          break;
        case AccountType.Liability:
          liabilities -= balance;
          break;
        case AccountType.Equity:
          equity -= balance;
          break;
        // Contra-Revenue reduces the revenue component of equity;
        // Contra-Expense reduces the expense component (increases equity net).
        case AccountType.Revenue:
          equity -= balance;
          break;
        case AccountType.Expense:
          equity += balance;
          break;
        default:
          break;
      }
    } else {
      switch (account.type) {
        case AccountType.Asset:
          assets += balance;
          break;
        case AccountType.Liability:
          liabilities += balance;
          break;
        case AccountType.Equity:
          equity += balance;
          break;
        // Revenue and Expense are "temporary" accounts. Until closing entries run,
        // their net (Revenue - Expense = net income) is part of equity on the balance sheet.
        case AccountType.Revenue:
          equity += balance;
          break;
        case AccountType.Expense:
          equity -= balance;
          break;
        default:
          break;
      }
    }
  }

  return { assets, liabilities, equity, balanced: assets === liabilities + equity };
}

export function incomeStatement(
  ledger: Ledger,
  chartOfAccounts: Account[],
  from: Date,
  to: Date
): IncomeStatement {
  const snapshot = ledger.buildBalancesInRange(from, to);

  let revenue = 0;
  let expenses = 0;

  for (const account of chartOfAccounts) {
    const raw = snapshot.get(account.id) ?? { debit: 0, credit: 0 };
    const balance = netBalance(account, raw);

    if (account.isContra && account.contraTo !== undefined) {
      // Contra-Revenue reduces revenue; Contra-Expense reduces expenses.
      if (account.contraTo === AccountType.Revenue) {
        revenue -= balance;
      } else if (account.contraTo === AccountType.Expense) {
        expenses -= balance;
      }
    } else if (account.type === AccountType.Revenue) {
      revenue += balance;
    } else if (account.type === AccountType.Expense) {
      expenses += balance;
    }
  }

  return { revenue, expenses, netIncome: revenue - expenses };
}
