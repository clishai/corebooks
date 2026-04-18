export enum AccountType {
  Asset = 'Asset',
  Liability = 'Liability',
  Equity = 'Equity',
  Revenue = 'Revenue',
  Expense = 'Expense',
}

export interface Account {
  id: string;
  number: string;
  name: string;
  type: AccountType;
  normalBalance: 'debit' | 'credit';
  isContra: boolean;
  contraTo?: AccountType;
}
