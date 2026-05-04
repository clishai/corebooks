// src/api/routes/recurring.ts
import { FastifyPluginAsync } from 'fastify'
import type { AppContext } from '../server.js'
import {
  listRecurringTemplates,
  createRecurringTemplate,
  getRecurringTemplate,
  updateRecurringTemplate,
  deleteRecurringTemplate,
} from '../../db/repositories/recurringRepository.js'

interface RouteOptions { context: AppContext }

export const recurringRoutes: FastifyPluginAsync<RouteOptions> = async (app) => {
  app.get('/', async () => listRecurringTemplates())

  app.get<{ Params: { id: string } }>('/:id', async (req, reply) => {
    const t = await getRecurringTemplate(req.params.id)
    if (!t) return reply.notFound()
    return t
  })

  app.post<{ Body: Record<string, unknown> }>('/', async (req, reply) => {
    const b = req.body
    if (!b['name'] || !b['memo'] || !b['schedule'] || !b['nextDue'] || !Array.isArray(b['lines'])) {
      return reply.badRequest('name, memo, schedule, nextDue, and lines are required')
    }
    return createRecurringTemplate({
      name: b['name'] as string,
      memo: b['memo'] as string,
      paymentMethod: b['paymentMethod'] as string | undefined,
      schedule: b['schedule'] as 'weekly' | 'monthly' | 'quarterly' | 'annually' | 'custom',
      customCron: b['customCron'] as string | undefined,
      nextDue: new Date(b['nextDue'] as string),
      autoPost: Boolean(b['autoPost']),
      lines: (b['lines'] as Array<Record<string, unknown>>).map((l) => ({
        accountId: l['accountId'] as string,
        type: l['type'] as 'debit' | 'credit',
        amount: Number(l['amount']),
      })),
    })
  })

  app.patch<{ Params: { id: string }; Body: Record<string, unknown> }>('/:id', async (req, reply) => {
    const t = await getRecurringTemplate(req.params.id)
    if (!t) return reply.notFound()
    return updateRecurringTemplate(req.params.id, req.body as Parameters<typeof updateRecurringTemplate>[1])
  })

  app.delete<{ Params: { id: string } }>('/:id', async (req, reply) => {
    const t = await getRecurringTemplate(req.params.id)
    if (!t) return reply.notFound()
    await deleteRecurringTemplate(req.params.id)
    return { deleted: true }
  })
}
