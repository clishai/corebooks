import { FastifyPluginAsync } from 'fastify'
import { listPluginCategories, setPluginCategoryEnabled } from '../../db/repositories/pluginRepository.js'

export const pluginRoutes: FastifyPluginAsync = async (app) => {
  app.get('/categories', async () => listPluginCategories())

  app.patch<{ Params: { id: string }; Body: { enabled?: boolean } }>('/categories/:id', async (req, reply) => {
    if (typeof req.body.enabled !== 'boolean') {
      return reply.badRequest('enabled must be a boolean.')
    }
    return setPluginCategoryEnabled(req.params.id, req.body.enabled)
  })
}
