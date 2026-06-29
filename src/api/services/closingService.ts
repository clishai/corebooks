/**
 * closingService.ts — period-end closing entry generation and posting.
 *
 * Closing entries zero out Revenue and Expense accounts at the end of a period
 * by transferring their net balance to a designated Retained Earnings equity
 * account. The generated entry is saved as a draft first so the user can
 * review it before it becomes permanent.
 *
 * Flow:
 *   1. generateClosingEntry  — builds and persists a draft closing entry.
 *   2. postClosingEntry      — posts the draft and marks the period as closed.
 */

import { incomeStatement } from '../../core/engine/reporting.js';
import { EntryStatus } from '../../core/types/journal.js';
import type { JournalLine } from '../../core/types/journal.js';
import type { Ledger } from '../../core/engine/ledger.js';
import { getPeriodConfig, closePeriod, isPeriodClosed } from '../../db/repositories/periodRepository.js';
import { createDraftEntry } from '../../db/repositories/entryRepository.js';
import { listAccounts } from '../../db/repositories/accountRepository.js';
import { grantPostingAuthority } from '../posting/authority.js';
import { postDraftWithAuthority } from './postingService.js';

export interface ClosingEntryResult {
  draftId: string;
  year: number;
  month: number;
  netIncome: number;
  lineCount: number;
}

export interface PostClosingResult {
  entryId: string;
  year: number;
  month: number;
}

/**
 * Generates a draft closing entry for the given year/month.
 *
 * - Reads the income statement for the period (first day through last day of the month).
 * - Debits all Revenue accounts (zeroing them out).
 * - Credits all Expense accounts (zeroing them out).
 * - The net income difference goes to the retained earnings account
 *   (credit if profitable, debit if a loss).
 *
 * Throws if:
 * - No retained earnings account is configured.
 * - The period is already closed.
 * - There are no revenue or expense entries to close (nothing to do).
 */
export async function generateClosingEntry(
  year: number,
  month: number,
  ledger: Ledger
): Promise<ClosingEntryResult> {
  const config = await getPeriodConfig();

  if (!config.retainedEarningsAcctId) {
    throw new Error(
      'No retained earnings account is configured. Go to Settings → Accounting to select one.'
    );
  }

  const alreadyClosed = await isPeriodClosed(year, month);
  if (alreadyClosed) {
    throw new Error(
      `Period ${year}-${String(month).padStart(2, '0')} is already closed.`
    );
  }

  const accounts = await listAccounts();

  // Build the date range: first day to last day of the month.
  const from = new Date(year, month - 1, 1);
  const to = new Date(year, month, 0); // day 0 of next month = last day of this month

  const statement = incomeStatement(ledger, accounts, from, to);

  const lines: JournalLine[] = [];

  // Zero out each revenue account. Normal revenue accounts carry a credit
  // balance (positive) → debit them. Contra-revenue accounts (e.g. Sales
  // Returns) carry a debit balance and are represented here with a negative
  // balance → credit them. Always pass a positive amount to validateEntry.
  for (const rev of statement.revenueLines) {
    if (rev.balance !== 0) {
      lines.push({
        accountId: rev.accountId,
        amount: Math.abs(rev.balance),
        type: rev.balance > 0 ? 'debit' : 'credit',
      });
    }
  }

  // Zero out each expense account. Normal expense accounts carry a debit
  // balance (positive) → credit them. Contra-expense accounts (e.g. Purchase
  // Rebates) carry a credit balance and are represented here with a negative
  // balance → debit them. Always pass a positive amount to validateEntry.
  for (const exp of statement.expenseLines) {
    if (exp.balance !== 0) {
      lines.push({
        accountId: exp.accountId,
        amount: Math.abs(exp.balance),
        type: exp.balance > 0 ? 'credit' : 'debit',
      });
    }
  }

  if (lines.length === 0) {
    throw new Error(
      `No revenue or expense activity found for ${year}-${String(month).padStart(2, '0')}. There is nothing to close.`
    );
  }

  // The net income flows to retained earnings.
  // Profitable (positive netIncome): credit retained earnings.
  // Loss (negative netIncome): debit retained earnings.
  const netIncome = statement.netIncome;
  if (netIncome !== 0) {
    lines.push({
      accountId: config.retainedEarningsAcctId,
      amount: Math.abs(netIncome),
      type: netIncome > 0 ? 'credit' : 'debit',
    });
  }

  // Use the last day of the period as the closing entry date.
  const closingDate = new Date(year, month, 0);

  const draft = await createDraftEntry({
    date: closingDate,
    memo: `Period close — ${year}-${String(month).padStart(2, '0')}`,
    status: EntryStatus.Draft,
    lines,
  });

  return {
    draftId: draft.id!,
    year,
    month,
    netIncome,
    lineCount: lines.length,
  };
}

/**
 * Posts the previously generated draft closing entry and marks the period as closed.
 *
 * Throws if:
 * - The draft cannot be found.
 * - The entry fails validation (should not happen for system-generated entries).
 * - The period is already closed.
 */
export async function postClosingEntry(
  draftId: string,
  year: number,
  month: number,
  ledger: Ledger
): Promise<PostClosingResult> {
  const alreadyClosed = await isPeriodClosed(year, month);
  if (alreadyClosed) {
    throw new Error(
      `Period ${year}-${String(month).padStart(2, '0')} is already closed.`
    );
  }

  const accounts = await listAccounts();

  // Fetch the draft by loading the full list and finding by ID — the entry
  // repository doesn't expose a direct getDraftById, but findEntryById works.
  const { findEntryById } = await import('../../db/repositories/entryRepository.js');
  const draft = await findEntryById(draftId);

  if (!draft) {
    throw new Error(`Draft entry "${draftId}" not found.`);
  }

  if (draft.status === EntryStatus.Posted) {
    throw new Error(`Entry "${draftId}" is already posted.`);
  }

  // The posting facade includes the period-lock check; since this is a
  // closing entry the check will pass before the period is marked closed.
  const result = await postDraftWithAuthority(
    draft,
    accounts,
    ledger,
    grantPostingAuthority('closing'),
  );

  if (!result.posted) {
    const messages = result.errors.map((e) => e.message).join('; ');
    throw new Error(`Closing entry validation failed: ${messages}`);
  }

  await closePeriod(year, month, result.entry.id!);

  return { entryId: result.entry.id!, year, month };
}
