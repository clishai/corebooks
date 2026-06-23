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
  const safeLimit = Number.isFinite(limit) ? limit : 100
  const rows = await prisma.auditEvent.findMany({
    orderBy: { createdAt: 'desc' },
    take: Math.min(Math.max(safeLimit, 1), 500),
  })
  return rows.map((row) => ({
    id: row.id,
    action: row.action,
    entityType: row.entityType,
    entityId: row.entityId,
    detail: parseDetail(row.detailJson),
    createdAt: row.createdAt,
  }))
}

function parseDetail(raw: string | null): Record<string, unknown> | null {
  if (!raw) return null
  try {
    return JSON.parse(raw) as Record<string, unknown>
  } catch {
    return { parseError: true }
  }
}
