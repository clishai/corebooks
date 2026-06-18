import { getPrismaClient } from '../client.js'

export interface AuditEventInput {
  action: string
  entityType: string
  entityId?: string | null
  detail?: Record<string, unknown>
}

export async function logAuditEvent(input: AuditEventInput): Promise<void> {
  const prisma = getPrismaClient()
  await prisma.auditEvent.create({
    data: {
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId ?? null,
      detailJson: input.detail ? JSON.stringify(input.detail) : null,
    },
  })
}

export async function listAuditEvents(limit = 100): Promise<Array<{
  id: string
  action: string
  entityType: string
  entityId: string | null
  detail: Record<string, unknown> | null
  createdAt: Date
}>> {
  const prisma = getPrismaClient()
  const rows = await prisma.auditEvent.findMany({
    orderBy: { createdAt: 'desc' },
    take: Math.min(Math.max(limit, 1), 500),
  })
  return rows.map((row) => ({
    id: row.id,
    action: row.action,
    entityType: row.entityType,
    entityId: row.entityId,
    detail: row.detailJson ? JSON.parse(row.detailJson) as Record<string, unknown> : null,
    createdAt: row.createdAt,
  }))
}
