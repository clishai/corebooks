// src/api/services/recurringService.ts
import { getOverdueTemplates, advanceNextDue } from '../../db/repositories/recurringRepository.js'
import { createDraftEntry, postDraftEntry } from '../../db/repositories/entryRepository.js'
import { listAccounts } from '../../db/repositories/accountRepository.js'
import { EntryStatus } from '../../core/types/journal.js'
import type { Ledger } from '../../core/engine/ledger.js'

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
        const result = await postDraftEntry(draft, accounts, ledger)
        if (!result.posted) continue
      }

      await advanceNextDue(template.id, template.schedule, template.nextDue)
      fired++
    } catch (err) {
      console.error(`[recurring] failed to fire template ${template.id}:`, err)
    }
  }
  return fired
}
