// src/api/services/recurringService.ts
import { getOverdueTemplates, advanceNextDue } from '../../db/repositories/recurringRepository.js'
import { createDraftEntry } from '../../db/repositories/entryRepository.js'
import { listAccounts } from '../../db/repositories/accountRepository.js'
import { EntryStatus } from '../../core/types/journal.js'
import type { Ledger } from '../../core/engine/ledger.js'
import { grantPostingAuthority } from '../posting/authority.js'
import { postDraftWithAuthority } from './postingService.js'

export async function fireOverdueTemplates(ledger: Ledger): Promise<number> {
  const overdue = await getOverdueTemplates()
  let fired = 0
  for (const template of overdue) {
    try {
      const lines = template.lines.map((l) => ({
        accountId: l.accountId,
        type: l.type as 'debit' | 'credit',
        amount: l.amount,
      }))

      // createDraftEntry expects a full JournalEntry object
      const draft = await createDraftEntry({
        date: new Date(),
        memo: template.memo,
        paymentMethod: template.paymentMethod ?? undefined,
        status: EntryStatus.Draft,
        lines,
      })

      if (template.autoPost && draft.id) {
        const accounts = await listAccounts()
        const result = await postDraftWithAuthority(
          draft,
          accounts,
          ledger,
          grantPostingAuthority('recurring'),
        )
        // Advance the due date even on post failure — the draft already exists.
        // Skipping advanceNextDue would re-fire this template on every scheduler
        // tick and create unbounded duplicate drafts.
        if (!result.posted) {
          console.error(`[recurring] autoPost failed for template ${template.id}:`, result.errors)
        }
      }

      await advanceNextDue(template.id, template.schedule, template.nextDue)
      fired++
    } catch (err) {
      console.error(`[recurring] failed to fire template ${template.id}:`, err)
    }
  }
  return fired
}
