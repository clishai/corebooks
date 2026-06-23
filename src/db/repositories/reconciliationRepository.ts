import { getPrismaClient } from '../client.js'
import { toDbCents } from '../mappers.js'
import { listPostedEntries } from './entryRepository.js'

export interface ReconciliationSessionInput {
  accountId: string
  statementDate: Date
  endingBalance: number
  notes?: string | null
}

export interface ReconciliationSessionSummary {
  id: string
  accountId: string
  statementDate: Date
  endingBalance: number
  status: string
  notes: string | null
  clearedBalance: number
  difference: number
  itemCount: number
  clearedCount: number
  createdAt: Date
  updatedAt: Date
}

export interface ReconciliationEntryItem {
  entryId: string
  date: Date
  memo: string
  amount: number
  cleared: boolean
}

function signedAmountForAccount(entry: Awaited<ReturnType<typeof listPostedEntries>>[number], accountId: string): number {
  return entry.lines.reduce((sum, line) => {
    if (line.accountId !== accountId) return sum
    return sum + (line.type === 'debit' ? line.amount : -line.amount)
  }, 0)
}

export async function createReconciliationSession(input: ReconciliationSessionInput): Promise<ReconciliationSessionSummary> {
  const prisma = getPrismaClient()
  const session = await prisma.reconciliationSession.create({
    data: {
      accountId: input.accountId,
      statementDate: input.statementDate,
      endingBalance: toDbCents(input.endingBalance),
      notes: input.notes ?? null,
    },
  })
  return getReconciliationSession(session.id)
}

export async function listReconciliationSessions(): Promise<ReconciliationSessionSummary[]> {
  const prisma = getPrismaClient()
  const sessions = await prisma.reconciliationSession.findMany({
    orderBy: { statementDate: 'desc' },
  })
  return Promise.all(sessions.map((session) => getReconciliationSession(session.id)))
}

export async function getReconciliationSession(id: string): Promise<ReconciliationSessionSummary> {
  const prisma = getPrismaClient()
  const session = await prisma.reconciliationSession.findUnique({
    where: { id },
    include: { items: true },
  })
  if (!session) throw new Error(`Reconciliation session "${id}" not found.`)
  const entries = await listPostedEntries(undefined, session.statementDate.toISOString().slice(0, 10))
  const clearedIds = new Set(session.items.filter((item) => item.cleared).map((item) => item.entryId))
  const clearedBalance = entries
    .filter((entry) => entry.id && clearedIds.has(entry.id))
    .reduce((sum, entry) => sum + signedAmountForAccount(entry, session.accountId), 0)
  const endingBalance = session.endingBalance / 100
  return {
    id: session.id,
    accountId: session.accountId,
    statementDate: session.statementDate,
    endingBalance,
    status: session.status,
    notes: session.notes,
    clearedBalance,
    difference: endingBalance - clearedBalance,
    itemCount: session.items.length,
    clearedCount: session.items.filter((item) => item.cleared).length,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
  }
}

export async function listReconciliationItems(sessionId: string): Promise<ReconciliationEntryItem[]> {
  const prisma = getPrismaClient()
  const session = await prisma.reconciliationSession.findUnique({
    where: { id: sessionId },
    include: { items: true },
  })
  if (!session) throw new Error(`Reconciliation session "${sessionId}" not found.`)
  const itemMap = new Map(session.items.map((item) => [item.entryId, item.cleared]))
  const entries = await listPostedEntries(undefined, session.statementDate.toISOString().slice(0, 10))
  return entries
    .map((entry) => ({
      entryId: entry.id ?? '',
      date: new Date(entry.date),
      memo: entry.memo,
      amount: signedAmountForAccount(entry, session.accountId),
      cleared: itemMap.get(entry.id ?? '') ?? false,
    }))
    .filter((item) => item.entryId && item.amount !== 0)
}

export async function setReconciliationItem(sessionId: string, entryId: string, cleared: boolean): Promise<void> {
  const prisma = getPrismaClient()
  await prisma.reconciliationItem.upsert({
    where: { sessionId_entryId: { sessionId, entryId } },
    update: { cleared },
    create: { sessionId, entryId, cleared },
  })
}

export async function closeReconciliationSession(id: string): Promise<ReconciliationSessionSummary> {
  const prisma = getPrismaClient()
  const current = await getReconciliationSession(id)
  if (current.status === 'closed') return current
  if (Math.abs(current.difference) > 0.009) {
    throw new Error('Reconciliation cannot be closed until the difference is zero.')
  }
  await prisma.reconciliationSession.update({
    where: { id },
    data: { status: 'closed', updatedAt: new Date() },
  })
  return getReconciliationSession(id)
}

export async function deleteReconciliationSession(id: string): Promise<void> {
  const prisma = getPrismaClient()
  await prisma.reconciliationSession.delete({ where: { id } })
}
