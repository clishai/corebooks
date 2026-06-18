import { reverseEntry } from '../../core/engine/entries.js'
import type { Account } from '../../core/types/account.js'
import type { JournalEntry } from '../../core/types/journal.js'
import type { Ledger } from '../../core/engine/ledger.js'
import { getPrismaClient } from '../../db/client.js'
import { PrismaJournalEntry, toCoreJournalEntry, toDbJournalEntry } from '../../db/mappers.js'
import {
  postDraftEntry,
  type PostPersistedResult,
} from '../../db/repositories/entryRepository.js'
import { logAuditEvent } from '../../db/repositories/auditRepository.js'
import type { PostingAuthority } from '../../types/posting.js'
import { assertPostingAllowed } from '../posting/authority.js'

export async function postDraftWithAuthority(
  draft: JournalEntry,
  chartOfAccounts: Account[],
  ledger: Ledger,
  authority: PostingAuthority,
): Promise<PostPersistedResult> {
  assertPostingAllowed(authority)
  const result = await postDraftEntry(draft, chartOfAccounts, ledger, authority)
  if (result.posted) {
    await logAuditEvent({
      action: 'entry.posted',
      entityType: 'JournalEntry',
      entityId: result.entry.id,
      detail: { channel: authority.channel, memo: result.entry.memo },
    })
  }
  return result
}

export async function reverseEntryWithAuthority(
  originalId: string,
  date: Date,
  ledger: Ledger,
  chartOfAccounts: Account[],
  authority: PostingAuthority,
): Promise<PostPersistedResult> {
  assertPostingAllowed(authority)

  const result = reverseEntry(originalId, date, ledger, chartOfAccounts)
  if (!result.posted) return result

  const prisma = getPrismaClient()
  const data = toDbJournalEntry(result.entry)
  const row = await prisma.journalEntry.create({
    data: {
      ...(data as Parameters<typeof prisma.journalEntry.create>[0]['data']),
      postedVia: authority.channel,
    } as Parameters<typeof prisma.journalEntry.create>[0]['data'],
    include: { lines: { orderBy: { id: 'asc' } } },
  })
  const persisted = toCoreJournalEntry(row as unknown as PrismaJournalEntry)

  // reverseEntry first posts to the in-memory ledger with a temporary numeric
  // ID; sync it to the persistent cuid so future reversals and reports agree.
  result.entry.id = persisted.id

  await logAuditEvent({
    action: 'entry.reversed',
    entityType: 'JournalEntry',
    entityId: persisted.id,
    detail: { channel: authority.channel, reversalOf: originalId },
  })

  return { posted: true, entry: persisted }
}
