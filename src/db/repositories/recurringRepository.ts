// src/db/repositories/recurringRepository.ts
import { getPrismaClient } from '../client.js'

export interface RecurringLineInput {
  accountId: string
  type: 'debit' | 'credit'
  amount: number  // dollars — converted to cents here
}

export interface RecurringTemplateInput {
  name: string
  memo: string
  paymentMethod?: string
  schedule: 'weekly' | 'monthly' | 'quarterly' | 'annually' | 'custom'
  customCron?: string
  nextDue: Date
  autoPost: boolean
  lines: RecurringLineInput[]
}

function toDbCents(dollars: number): number {
  return Math.round(dollars * 100)
}

function fromDbCents(cents: number): number {
  return cents / 100
}

export async function createRecurringTemplate(input: RecurringTemplateInput) {
  const prisma = getPrismaClient()
  const t = await prisma.recurringTemplate.create({
    data: {
      name: input.name,
      memo: input.memo,
      paymentMethod: input.paymentMethod,
      schedule: input.schedule,
      customCron: input.customCron,
      nextDue: input.nextDue,
      autoPost: input.autoPost,
      lines: {
        create: input.lines.map((l) => ({
          accountId: l.accountId,
          type: l.type,
          amount: toDbCents(l.amount),
        })),
      },
    },
    include: { lines: true },
  })
  return { ...t, lines: t.lines.map((l) => ({ ...l, amount: fromDbCents(l.amount) })) }
}

export async function listRecurringTemplates() {
  const prisma = getPrismaClient()
  const rows = await prisma.recurringTemplate.findMany({
    include: { lines: { include: { account: true } } },
    orderBy: { nextDue: 'asc' },
  })
  return rows.map((t) => ({
    ...t,
    lines: t.lines.map((l) => ({ ...l, amount: fromDbCents(l.amount) })),
  }))
}

export async function getRecurringTemplate(id: string) {
  const prisma = getPrismaClient()
  const t = await prisma.recurringTemplate.findUnique({
    where: { id },
    include: { lines: { include: { account: true } } },
  })
  if (!t) return null
  return { ...t, lines: t.lines.map((l) => ({ ...l, amount: fromDbCents(l.amount) })) }
}

export async function updateRecurringTemplate(id: string, input: Partial<RecurringTemplateInput>) {
  const prisma = getPrismaClient()
  const { lines, ...rest } = input
  if (lines !== undefined) {
    await prisma.recurringLine.deleteMany({ where: { templateId: id } })
    await prisma.recurringLine.createMany({
      data: lines.map((l) => ({
        id: crypto.randomUUID(),
        templateId: id,
        accountId: l.accountId,
        type: l.type,
        amount: toDbCents(l.amount),
      })),
    })
  }
  const updated = await prisma.recurringTemplate.update({
    where: { id },
    data: { ...rest },
    include: { lines: true },
  })
  return { ...updated, lines: updated.lines.map((l) => ({ ...l, amount: fromDbCents(l.amount) })) }
}

export async function deleteRecurringTemplate(id: string) {
  const prisma = getPrismaClient()
  return prisma.recurringTemplate.delete({ where: { id } })
}

export async function getOverdueTemplates() {
  const prisma = getPrismaClient()
  const rows = await prisma.recurringTemplate.findMany({
    where: { nextDue: { lte: new Date() } },
    include: { lines: true },
  })
  return rows.map((t) => ({
    ...t,
    lines: t.lines.map((l) => ({ ...l, amount: fromDbCents(l.amount) })),
  }))
}

export async function advanceNextDue(id: string, schedule: string, currentDue: Date): Promise<Date> {
  const next = new Date(currentDue)
  switch (schedule) {
    case 'weekly':    next.setDate(next.getDate() + 7); break
    case 'monthly':   next.setMonth(next.getMonth() + 1); break
    case 'quarterly': next.setMonth(next.getMonth() + 3); break
    case 'annually':  next.setFullYear(next.getFullYear() + 1); break
    default:          next.setMonth(next.getMonth() + 1); break
  }
  const prisma = getPrismaClient()
  await prisma.recurringTemplate.update({ where: { id }, data: { nextDue: next } })
  return next
}
