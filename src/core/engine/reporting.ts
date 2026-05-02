import { Account, AccountType } from '../types/account.js';
import { Ledger, RawBalance } from './ledger.js';

export interface BalanceSheetLine {
  accountId: string;
  accountNumber: string;
  accountName: string;
  balance: number; // signed contribution to the section total
}

export interface BalanceSheetSection {
  lines: BalanceSheetLine[];
  total: number;
}

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
  // Section breakdowns for display
  currentAssets: BalanceSheetSection;
  nonCurrentAssets: BalanceSheetSection;
  currentLiabilities: BalanceSheetSection;
  nonCurrentLiabilities: BalanceSheetSection;
  retainedEquityAccounts: BalanceSheetSection;
  // Aggregate totals — unchanged from prior interface
  assets: number;
  liabilities: number;
  retainedEquity: number; // sum of Equity-type accounts (permanent equity)
  netIncome: number;      // Revenue − Expenses, current period, not yet closed
  equity: number;         // retainedEquity + netIncome
  balanced: boolean;
}

export interface IncomeStatement {
  revenueLines: BalanceSheetLine[];
  expenseLines: BalanceSheetLine[];
  revenue: number;
  expenses: number;
  netIncome: number;
}

function netBalance(account: Account, raw: RawBalance): number {
  if (account.normalBalance === 'debit') {
    return raw.debit - raw.credit;
  }
  return raw.credit - raw.debit;
}

function makeSection(lines: BalanceSheetLine[]): BalanceSheetSection {
  return { lines, total: lines.reduce((s, l) => s + l.balance, 0) };
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

  const caLines: BalanceSheetLine[] = [];
  const ncaLines: BalanceSheetLine[] = [];
  const clLines: BalanceSheetLine[] = [];
  const nclLines: BalanceSheetLine[] = [];
  const eqLines: BalanceSheetLine[] = [];

  let assets = 0;
  let liabilities = 0;
  let retainedEquity = 0;
  let revenue = 0;
  let expenses = 0;

  for (const account of chartOfAccounts) {
    const raw = snapshot.get(account.id) ?? { debit: 0, credit: 0 };
    const balance = netBalance(account, raw);
    const isNonCurrent = account.classification === 'non-current';

    if (account.isContra && account.contraTo !== undefined) {
      // Contra accounts reduce their parent type; signed contribution is negative.
      switch (account.contraTo) {
        case AccountType.Asset:
          assets -= balance;
          if (balance !== 0) {
            (isNonCurrent ? ncaLines : caLines).push({
              accountId: account.id, accountNumber: account.number,
              accountName: account.name, balance: -balance,
            });
          }
          break;
        case AccountType.Liability:
          liabilities -= balance;
          if (balance !== 0) {
            (isNonCurrent ? nclLines : clLines).push({
              accountId: account.id, accountNumber: account.number,
              accountName: account.name, balance: -balance,
            });
          }
          break;
        case AccountType.Equity:     retainedEquity -= balance; break;
        case AccountType.Revenue:    revenue -= balance;        break;
        case AccountType.Expense:    expenses -= balance;       break;
        default: break;
      }
    } else {
      switch (account.type) {
        case AccountType.Asset:
          assets += balance;
          if (balance !== 0) {
            (isNonCurrent ? ncaLines : caLines).push({
              accountId: account.id, accountNumber: account.number,
              accountName: account.name, balance,
            });
          }
          break;
        case AccountType.Liability:
          liabilities += balance;
          if (balance !== 0) {
            (isNonCurrent ? nclLines : clLines).push({
              accountId: account.id, accountNumber: account.number,
              accountName: account.name, balance,
            });
          }
          break;
        case AccountType.Equity:
          retainedEquity += balance;
          if (balance !== 0) {
            eqLines.push({
              accountId: account.id, accountNumber: account.number,
              accountName: account.name, balance,
            });
          }
          break;
        case AccountType.Revenue:    revenue += balance;   break;
        case AccountType.Expense:    expenses += balance;  break;
        default: break;
      }
    }
  }

  const netIncome = revenue - expenses;
  const equity = retainedEquity + netIncome;
  return {
    currentAssets: makeSection(caLines),
    nonCurrentAssets: makeSection(ncaLines),
    currentLiabilities: makeSection(clLines),
    nonCurrentLiabilities: makeSection(nclLines),
    retainedEquityAccounts: makeSection(eqLines),
    assets,
    liabilities,
    retainedEquity,
    netIncome,
    equity,
    balanced: assets === liabilities + equity,
  };
}

export function incomeStatement(
  ledger: Ledger,
  chartOfAccounts: Account[],
  from: Date,
  to: Date
): IncomeStatement {
  const snapshot = ledger.buildBalancesInRange(from, to);

  const revLines: BalanceSheetLine[] = [];
  const expLines: BalanceSheetLine[] = [];
  let revenue = 0;
  let expenses = 0;

  for (const account of chartOfAccounts) {
    const raw = snapshot.get(account.id) ?? { debit: 0, credit: 0 };
    const balance = netBalance(account, raw);

    if (account.isContra && account.contraTo !== undefined) {
      if (account.contraTo === AccountType.Revenue) {
        revenue -= balance;
        if (balance !== 0) {
          revLines.push({ accountId: account.id, accountNumber: account.number, accountName: account.name, balance: -balance });
        }
      } else if (account.contraTo === AccountType.Expense) {
        expenses -= balance;
        if (balance !== 0) {
          expLines.push({ accountId: account.id, accountNumber: account.number, accountName: account.name, balance: -balance });
        }
      }
    } else if (account.type === AccountType.Revenue) {
      revenue += balance;
      if (balance !== 0) {
        revLines.push({ accountId: account.id, accountNumber: account.number, accountName: account.name, balance });
      }
    } else if (account.type === AccountType.Expense) {
      expenses += balance;
      if (balance !== 0) {
        expLines.push({ accountId: account.id, accountNumber: account.number, accountName: account.name, balance });
      }
    }
  }

  return { revenueLines: revLines, expenseLines: expLines, revenue, expenses, netIncome: revenue - expenses };
}
