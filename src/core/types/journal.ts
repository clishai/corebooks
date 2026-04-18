export enum EntryStatus {
  Draft = 'Draft',
  Posted = 'Posted',
}

export interface JournalLine {
  accountId: string;
  amount: number;
  type: 'debit' | 'credit';
  memo?: string;
}

export interface JournalEntry {
  id?: string;
  date: Date;
  memo: string;
  status: EntryStatus;
  paymentMethod?: string;
  lines: JournalLine[];
}
