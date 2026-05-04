import { FastifyPluginAsync } from 'fastify'
import {
  createUser,
  findUserByEmail,
  listUsers,
  updateUserRole,
  deleteUser,
  countAdmins,
  hasAnyUser,
  verifyPassword,
} from '../../db/repositories/userRepository.js'
import {
  createSession,
  destroySession,
  requireAuth,
  isMultiUserMode,
  type Session,
} from '../middleware/auth.js'

export const authRoutes: FastifyPluginAsync = async (app) => {
  // GET /auth/status — whether multi-user mode is active and whether first setup is needed
  app.get('/status', async () => {
    const active = isMultiUserMode()
    if (!active) return { active: false, needsSetup: false }
    const needsSetup = !(await hasAnyUser())
    return { active, needsSetup }
  })

  // POST /auth/setup — create first Admin user (PostgreSQL mode only, no users exist yet)
  app.post<{ Body: { email: string; password: string } }>('/setup', async (req, reply) => {
    if (!isMultiUserMode()) {
      return reply.code(400).send({ error: 'Multi-user mode is not active.' })
    }
    if (await hasAnyUser()) {
      return reply.code(409).send({ error: 'Setup already complete.' })
    }
    const { email, password } = req.body
    if (!email || !password) {
      return reply.code(400).send({ error: 'Email and password are required.' })
    }
    const user = await createUser(email, password, 'Admin')
    const token = createSession({ userId: user.id, email: user.email, role: 'Admin' })
    return { token, user: { id: user.id, email: user.email, role: user.role } }
  })

  // POST /auth/login
  app.post<{ Body: { email: string; password: string } }>('/login', async (req, reply) => {
    if (!isMultiUserMode()) {
      return reply.code(400).send({ error: 'Multi-user mode is not active.' })
    }
    const { email, password } = req.body
    if (!email || !password) {
      return reply.code(400).send({ error: 'Email and password are required.' })
    }
    const user = await findUserByEmail(email)
    if (!user || !verifyPassword(password, user.passwordHash)) {
      return reply.code(401).send({ error: 'Invalid email or password.' })
    }
    const role = user.role as Session['role']
    const token = createSession({ userId: user.id, email: user.email, role })
    return { token, user: { id: user.id, email: user.email, role: user.role } }
  })

  // POST /auth/logout
  app.post<{ Headers: { authorization?: string } }>('/logout', async (req) => {
    const token = req.headers['authorization']?.startsWith('Bearer ')
      ? req.headers['authorization'].slice(7)
      : null
    if (token) destroySession(token)
    return { ok: true }
  })

  // GET /auth/me
  app.get('/me', async (req, reply) => {
    await requireAuth(req, reply)
    if (reply.sent) return
    const session = (req as typeof req & { session: Session }).session
    return { id: session.userId, email: session.email, role: session.role }
  })

  // GET /auth/users — Admin only
  app.get('/users', async (req, reply) => {
    await requireAuth(req, reply, 'Admin')
    if (reply.sent) return
    return listUsers()
  })

  // POST /auth/users — Admin only, creates Viewer or Bookkeeper
  app.post<{ Body: { email: string; password: string; role: string } }>(
    '/users',
    async (req, reply) => {
      await requireAuth(req, reply, 'Admin')
      if (reply.sent) return
      const { email, password, role } = req.body
      if (!email || !password || !role) {
        return reply.code(400).send({ error: 'email, password, and role are required.' })
      }
      if (role === 'Admin') {
        return reply.code(400).send({ error: 'Use the promote endpoint to grant Admin role.' })
      }
      if (role !== 'Viewer' && role !== 'Bookkeeper') {
        return reply.code(400).send({ error: 'role must be Viewer or Bookkeeper.' })
      }
      const existing = await findUserByEmail(email)
      if (existing) {
        return reply.code(409).send({ error: 'A user with that email already exists.' })
      }
      return createUser(email, password, role)
    },
  )

  // POST /auth/users/:id/promote — Admin only + password confirm → make user Admin
  app.post<{ Params: { id: string }; Body: { password: string } }>(
    '/users/:id/promote',
    async (req, reply) => {
      await requireAuth(req, reply, 'Admin')
      if (reply.sent) return
      const session = (req as typeof req & { session: Session }).session
      // Require the acting Admin to confirm their own password
      const adminUser = await findUserByEmail(session.email)
      if (!adminUser || !verifyPassword(req.body.password, adminUser.passwordHash)) {
        return reply.code(403).send({ error: 'Password confirmation failed.' })
      }
      return updateUserRole(req.params.id, 'Admin')
    },
  )

  // DELETE /auth/users/:id — Admin only, cannot delete last Admin
  app.delete<{ Params: { id: string } }>('/users/:id', async (req, reply) => {
    await requireAuth(req, reply, 'Admin')
    if (reply.sent) return
    const session = (req as typeof req & { session: Session }).session
    if (req.params.id === session.userId) {
      return reply.code(400).send({ error: 'You cannot delete your own account.' })
    }
    const adminCount = await countAdmins()
    // Check if the user being deleted is an Admin
    const users = await listUsers()
    const target = users.find((u) => u.id === req.params.id)
    if (!target) return reply.code(404).send({ error: 'User not found.' })
    if (target.role === 'Admin' && adminCount <= 1) {
      return reply.code(400).send({ error: 'Cannot delete the last Admin.' })
    }
    await deleteUser(req.params.id)
    return { deleted: true }
  })
}
