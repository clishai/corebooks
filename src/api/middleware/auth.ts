import { FastifyRequest, FastifyReply } from 'fastify'
import { randomBytes } from 'node:crypto'
import { isPostgresUrl } from '../../db/client.js'

export interface Session {
  userId: string
  email: string
  role: 'Viewer' | 'Bookkeeper' | 'Admin'
}

const SESSION_TTL_MS = 24 * 60 * 60 * 1000

interface SessionEntry {
  session: Session
  expiresAt: number
}

const sessions = new Map<string, SessionEntry>()

export function createSession(session: Session): string {
  const token = randomBytes(32).toString('hex')
  sessions.set(token, { session, expiresAt: Date.now() + SESSION_TTL_MS })
  return token
}

export function getSession(token: string): Session | undefined {
  const entry = sessions.get(token)
  if (!entry) return undefined
  if (Date.now() > entry.expiresAt) {
    sessions.delete(token)
    return undefined
  }
  return entry.session
}

export function destroySession(token: string): void {
  sessions.delete(token)
}

export function isMultiUserMode(): boolean {
  return isPostgresUrl(process.env['DATABASE_URL'] ?? '')
}

const ROLE_ORDER: Record<string, number> = { Viewer: 0, Bookkeeper: 1, Admin: 2 }

export async function requireAuth(
  req: FastifyRequest,
  reply: FastifyReply,
  minimumRole: 'Viewer' | 'Bookkeeper' | 'Admin' = 'Viewer',
): Promise<void> {
  if (!isMultiUserMode()) return
  const token =
    req.headers['authorization']?.startsWith('Bearer ')
      ? req.headers['authorization'].slice(7)
      : null
  if (!token) {
    reply.code(401).send({ error: 'Unauthorized' })
    return
  }
  const session = getSession(token)
  if (!session) {
    reply.code(401).send({ error: 'Session expired' })
    return
  }
  const sessionRoleLevel = ROLE_ORDER[session.role] ?? -1
  const requiredRoleLevel = ROLE_ORDER[minimumRole] ?? 0
  if (sessionRoleLevel < requiredRoleLevel) {
    reply.code(403).send({ error: 'Insufficient permissions' })
    return
  }
  ;(req as FastifyRequest & { session: Session }).session = session
}
