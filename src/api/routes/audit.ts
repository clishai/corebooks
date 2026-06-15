import { FastifyPluginAsync } from 'fastify'
import { listAuditEvents } from '../../db/repositories/auditRepository.js'

export const auditRoutes: FastifyPluginAsync = async (app) => {
  app.get<{ Querystring: { limit?: string } }>('/', async (req) => {
    return listAuditEvents(req.query.limit ? Number(req.query.limit) : 100)
  })
}
