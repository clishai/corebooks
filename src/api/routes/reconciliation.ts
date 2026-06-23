import { FastifyPluginAsync } from 'fastify'
import {
  closeReconciliationSession,
  createReconciliationSession,
  deleteReconciliationSession,
  getReconciliationSession,
  listReconciliationItems,
  listReconciliationSessions,
  setReconciliationItem,
} from '../../db/repositories/reconciliationRepository.js'
import { logAuditEvent } from '../../db/repositories/auditRepository.js'

export const reconciliationRoutes: FastifyPluginAsync = async (app) => {
  app.get('/sessions', async () => listReconciliationSessions())

  app.post<{ Body: { accountId?: string; statementDate?: string; endingBalance?: number; notes?: string } }>('/sessions', async (req, reply) => {
    if (!req.body.accountId || !req.body.statementDate || !Number.isFinite(req.body.endingBalance)) {
      return reply.badRequest('accountId, statementDate, and endingBalance are required.')
    }
    const endingBalance = req.body.endingBalance
    if (endingBalance === undefined) return reply.badRequest('endingBalance is required.')
    const statementDate = new Date(req.body.statementDate)
    if (Number.isNaN(statementDate.getTime())) return reply.badRequest('statementDate must be a valid date.')
    const session = await createReconciliationSession({
      accountId: req.body.accountId,
      statementDate,
      endingBalance,
      notes: req.body.notes,
    })
    await logAuditEvent({
      action: 'reconciliation.created',
      entityType: 'ReconciliationSession',
      entityId: session.id,
      detail: { accountId: session.accountId, statementDate: session.statementDate.toISOString() },
    })
    return reply.code(201).send(session)
  })

  app.get<{ Params: { id: string } }>('/sessions/:id', async (req) => getReconciliationSession(req.params.id))
  app.get<{ Params: { id: string } }>('/sessions/:id/items', async (req) => listReconciliationItems(req.params.id))

  app.post<{ Params: { id: string }; Body: { entryId?: string; cleared?: boolean } }>('/sessions/:id/items', async (req, reply) => {
    if (!req.body.entryId || typeof req.body.cleared !== 'boolean') {
      return reply.badRequest('entryId and cleared are required.')
    }
    await setReconciliationItem(req.params.id, req.body.entryId, req.body.cleared)
    return getReconciliationSession(req.params.id)
  })

  app.post<{ Params: { id: string } }>('/sessions/:id/close', async (req) => {
    const session = await closeReconciliationSession(req.params.id)
    await logAuditEvent({
      action: 'reconciliation.closed',
      entityType: 'ReconciliationSession',
      entityId: session.id,
      detail: { difference: session.difference },
    })
    return session
  })

  app.delete<{ Params: { id: string } }>('/sessions/:id', async (req, reply) => {
    await deleteReconciliationSession(req.params.id)
    return reply.code(204).send()
  })
}
