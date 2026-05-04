# Phase 9: Multi-User Roles Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add session-based auth with Viewer/Bookkeeper/Admin roles for PostgreSQL mode. SQLite stays single-user with no login. Admin promotion requires password re-confirmation. Multiple Admins can exist.

**Architecture:** New `User` Prisma model. `src/api/middleware/auth.ts` checks sessions. `src/api/routes/auth.ts` handles login/logout. Role is enforced per-route. SQLite mode skips all auth. Session stored in an in-memory Map (process restart clears sessions — acceptable for local-first single-instance use).

**Tech Stack:** Prisma 7, Fastify 5, React 19, Node.js `crypto` (built-in for password hashing)

---

### Task 1: User model in Prisma schema

**Files:**
- Modify: `prisma/schema.prisma`
- Modify: `src/db/ensureSchema.ts`

- [ ] **Step 1: Add User model**

```prisma
enum UserRole {
  Viewer
  Bookkeeper
  Admin
}

model User {
  id           String   @id @default(cuid())
  email        String   @unique
  passwordHash String
  role         UserRole @default(Viewer)
  createdAt    DateTime @default(now())
}
```

- [ ] **Step 2: Add table to ensureSchema.ts**

```typescript
db.exec(`
  CREATE TABLE IF NOT EXISTS "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL UNIQUE,
    "passwordHash" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'Viewer',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )
`);
```

- [ ] **Step 3: Regenerate + type check**

```bash
npx prisma generate && npx tsc --noEmit
```
Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma src/db/ensureSchema.ts
git commit -m "feat: add User model with role to schema"
```

---

### Task 2: User repository

**Files:**
- Create: `src/db/repositories/userRepository.ts`

- [ ] **Step 1: Write the file**

```typescript
// src/db/repositories/userRepository.ts
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { getPrismaClient } from '../client.js'

function hashPassword(password: string, salt: string): string {
  return createHash('sha256').update(salt + password).digest('hex')
}

export function generateSalt(): string {
  return randomBytes(16).toString('hex')
}

export function createPasswordHash(password: string): string {
  const salt = generateSalt()
  const hash = hashPassword(password, salt)
  return `${salt}:${hash}`
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(':')
  if (!salt || !hash) return false
  const candidate = hashPassword(password, salt)
  const candidateBuf = Buffer.from(candidate, 'hex')
  const hashBuf = Buffer.from(hash, 'hex')
  if (candidateBuf.length !== hashBuf.length) return false
  return timingSafeEqual(candidateBuf, hashBuf)
}

export async function createUser(email: string, password: string, role: 'Viewer' | 'Bookkeeper' | 'Admin') {
  const prisma = getPrismaClient()
  const passwordHash = createPasswordHash(password)
  return prisma.user.create({
    data: { id: crypto.randomUUID(), email, passwordHash, role },
    select: { id: true, email: true, role: true, createdAt: true },
  })
}

export async function findUserByEmail(email: string) {
  const prisma = getPrismaClient()
  return prisma.user.findUnique({ where: { email } })
}

export async function listUsers() {
  const prisma = getPrismaClient()
  return prisma.user.findMany({
    select: { id: true, email: true, role: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  })
}

export async function updateUserRole(id: string, role: 'Viewer' | 'Bookkeeper' | 'Admin') {
  const prisma = getPrismaClient()
  return prisma.user.update({
    where: { id },
    data: { role },
    select: { id: true, email: true, role: true },
  })
}

export async function deleteUser(id: string) {
  const prisma = getPrismaClient()
  return prisma.user.delete({ where: { id } })
}

export async function countAdmins(): Promise<number> {
  const prisma = getPrismaClient()
  return prisma.user.count({ where: { role: 'Admin' } })
}

export async function hasAnyUser(): Promise<boolean> {
  const prisma = getPrismaClient()
  return (await prisma.user.count()) > 0
}
```

- [ ] **Step 2: Type check**

```bash
npx tsc --noEmit
```
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/db/repositories/userRepository.ts
git commit -m "feat: add user repository with password hashing and role management"
```

---

### Task 3: Session store and auth middleware

**Files:**
- Create: `src/api/middleware/auth.ts`

- [ ] **Step 1: Write the middleware**

```typescript
// src/api/middleware/auth.ts
import { FastifyRequest, FastifyReply } from 'fastify'
import { randomBytes } from 'node:crypto'
import { isPostgresUrl } from '../../db/client.js'

export interface Session {
  userId: string
  email: string
  role: 'Viewer' | 'Bookkeeper' | 'Admin'
}

// In-memory session store — acceptable for single-instance local deployment
const sessions = new Map<string, Session>()

export function createSession(session: Session): string {
  const token = randomBytes(32).toString('hex')
  sessions.set(token, session)
  return token
}

export function getSession(token: string): Session | undefined {
  return sessions.get(token)
}

export function destroySession(token: string): void {
  sessions.delete(token)
}

export function isMultiUserMode(): boolean {
  const url = process.env['DATABASE_URL'] ?? ''
  return isPostgresUrl(url)
}

// Fastify preHandler that enforces authentication in PostgreSQL mode.
// SQLite mode: always passes through (no auth).
export async function requireAuth(
  req: FastifyRequest,
  reply: FastifyReply,
  minimumRole: 'Viewer' | 'Bookkeeper' | 'Admin' = 'Viewer'
): Promise<void> {
  if (!isMultiUserMode()) return  // SQLite — no auth

  const authHeader = req.headers['authorization']
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null
  if (!token) { reply.code(401).send({ error: 'Unauthorized' }); return }

  const session = getSession(token)
  if (!session) { reply.code(401).send({ error: 'Session expired' }); return }

  const roleOrder = ['Viewer', 'Bookkeeper', 'Admin']
  if (roleOrder.indexOf(session.role) < roleOrder.indexOf(minimumRole)) {
    reply.code(403).send({ error: 'Insufficient permissions' }); return
  }

  // Attach session to request for use in route handlers
  ;(req as FastifyRequest & { session: Session }).session = session
}
```

- [ ] **Step 2: Commit**

```bash
git add src/api/middleware/auth.ts
git commit -m "feat: add session store and requireAuth middleware"
```

---

### Task 4: Auth routes

**Files:**
- Create: `src/api/routes/auth.ts`
- Modify: `src/api/server.ts`

- [ ] **Step 1: Write the routes**

```typescript
// src/api/routes/auth.ts
import { FastifyPluginAsync } from 'fastify'
import {
  findUserByEmail, verifyPassword, hasAnyUser, createUser, listUsers,
  updateUserRole, deleteUser, countAdmins
} from '../../db/repositories/userRepository.js'
import {
  createSession, destroySession, getSession, isMultiUserMode
} from '../middleware/auth.js'

export const authRoutes: FastifyPluginAsync = async (app) => {
  // Check if auth is active (PostgreSQL mode) and if setup is needed
  app.get('/status', async () => {
    const active = isMultiUserMode()
    const needsSetup = active && !(await hasAnyUser())
    return { active, needsSetup }
  })

  // First-time setup — creates the initial Admin account
  app.post<{ Body: { email: string; password: string } }>('/setup', async (req, reply) => {
    if (!isMultiUserMode()) return reply.badRequest('Auth is only available in PostgreSQL mode')
    if (await hasAnyUser()) return reply.badRequest('Setup already completed')
    const { email, password } = req.body
    if (!email || !password) return reply.badRequest('email and password required')
    const user = await createUser(email, password, 'Admin')
    const token = createSession({ userId: user.id, email: user.email, role: 'Admin' })
    return { token, user }
  })

  // Login
  app.post<{ Body: { email: string; password: string } }>('/login', async (req, reply) => {
    if (!isMultiUserMode()) return reply.badRequest('Auth is only available in PostgreSQL mode')
    const { email, password } = req.body
    const user = await findUserByEmail(email)
    if (!user || !verifyPassword(password, user.passwordHash)) {
      return reply.code(401).send({ error: 'Invalid credentials' })
    }
    const token = createSession({ userId: user.id, email: user.email, role: user.role as 'Viewer' | 'Bookkeeper' | 'Admin' })
    return { token, user: { id: user.id, email: user.email, role: user.role } }
  })

  // Logout
  app.post('/logout', async (req) => {
    const token = req.headers['authorization']?.slice(7)
    if (token) destroySession(token)
    return { ok: true }
  })

  // Get current session info
  app.get('/me', async (req, reply) => {
    if (!isMultiUserMode()) return { active: false }
    const token = req.headers['authorization']?.slice(7)
    if (!token) return reply.code(401).send({ error: 'Unauthorized' })
    const session = getSession(token)
    if (!session) return reply.code(401).send({ error: 'Session expired' })
    return { active: true, ...session }
  })

  // List users (Admin only)
  app.get('/users', async (req, reply) => {
    await (require('../middleware/auth.js') as typeof import('../middleware/auth.js')).requireAuth(req, reply, 'Admin')
    if (reply.sent) return
    return listUsers()
  })

  // Create user (Admin only)
  app.post<{ Body: { email: string; password: string; role: string } }>('/users', async (req, reply) => {
    const { requireAuth } = await import('../middleware/auth.js')
    await requireAuth(req, reply, 'Admin')
    if (reply.sent) return
    const { email, password, role } = req.body
    if (!['Viewer', 'Bookkeeper'].includes(role)) return reply.badRequest('role must be Viewer or Bookkeeper')
    return createUser(email, password, role as 'Viewer' | 'Bookkeeper')
  })

  // Promote user to Admin (Admin only — requires password confirmation)
  app.post<{ Params: { id: string }; Body: { adminPassword: string } }>('/users/:id/promote', async (req, reply) => {
    const { requireAuth } = await import('../middleware/auth.js')
    await requireAuth(req, reply, 'Admin')
    if (reply.sent) return
    const session = (req as Parameters<typeof requireAuth>[0] & { session?: { userId: string; email: string } }).session
    if (!session) return reply.code(401).send({ error: 'Unauthorized' })
    const admin = await findUserByEmail(session.email)
    if (!admin || !verifyPassword(req.body.adminPassword, admin.passwordHash)) {
      return reply.code(403).send({ error: 'Password confirmation failed' })
    }
    return updateUserRole(req.params.id, 'Admin')
  })

  // Delete user (Admin only — cannot delete last Admin)
  app.delete<{ Params: { id: string } }>('/users/:id', async (req, reply) => {
    const { requireAuth } = await import('../middleware/auth.js')
    await requireAuth(req, reply, 'Admin')
    if (reply.sent) return
    const adminCount = await countAdmins()
    const users = await listUsers()
    const target = users.find((u) => u.id === req.params.id)
    if (target?.role === 'Admin' && adminCount <= 1) {
      return reply.badRequest('Cannot delete the last Admin account')
    }
    await deleteUser(req.params.id)
    return { deleted: true }
  })
}
```

- [ ] **Step 2: Register in server.ts**

```typescript
import { authRoutes } from './routes/auth.js'
// inside buildServer:
app.register(authRoutes, { prefix: '/auth' })
```

- [ ] **Step 3: Add to Vite proxy**

```typescript
'/auth': { target: 'http://127.0.0.1:3000', changeOrigin: true },
```

- [ ] **Step 4: Type check**

```bash
npx tsc --noEmit
```
Expected: no errors

- [ ] **Step 5: Commit**

```bash
git add src/api/routes/auth.ts src/api/server.ts vite.config.ts
git commit -m "feat: add auth routes — login, logout, user management, admin promotion"
```

---

### Task 5: Login page and auth state in UI

**Files:**
- Create: `src/ui/pages/LoginPage.tsx`
- Create: `src/ui/lib/auth.ts`
- Modify: `src/ui/main.tsx`

- [ ] **Step 1: Write auth state lib**

```typescript
// src/ui/lib/auth.ts
const TOKEN_KEY = 'cb_auth_token'

export function getAuthToken(): string | null {
  return sessionStorage.getItem(TOKEN_KEY)
}

export function setAuthToken(token: string): void {
  sessionStorage.setItem(TOKEN_KEY, token)
}

export function clearAuthToken(): void {
  sessionStorage.removeItem(TOKEN_KEY)
}

export async function checkAuthStatus(): Promise<{ active: boolean; needsSetup: boolean; role?: string }> {
  const res = await fetch('/auth/status')
  return res.json()
}

export async function login(email: string, password: string): Promise<{ token: string; user: { role: string } }> {
  const res = await fetch('/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  if (!res.ok) throw new Error((await res.json()).error ?? 'Login failed')
  return res.json()
}

export async function setupAdmin(email: string, password: string): Promise<{ token: string }> {
  const res = await fetch('/auth/setup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  if (!res.ok) throw new Error((await res.json()).error ?? 'Setup failed')
  return res.json()
}
```

- [ ] **Step 2: Write LoginPage**

```typescript
// src/ui/pages/LoginPage.tsx
import { useState } from 'react'
import { login, setupAdmin, setAuthToken } from '../lib/auth'

interface Props {
  needsSetup: boolean
  onSuccess: () => void
}

export default function LoginPage({ needsSetup, onSuccess }: Props) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (needsSetup && password !== confirm) { setError('Passwords do not match'); return }
    setLoading(true)
    try {
      const result = needsSetup
        ? await setupAdmin(email, password)
        : await login(email, password)
      setAuthToken(result.token)
      onSuccess()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex h-screen bg-base items-center justify-center">
      <div className="bg-surface border border-rim rounded-sm p-8 w-full max-w-sm">
        <h1 className="text-chalk font-semibold text-lg mb-1">
          {needsSetup ? 'Create Admin Account' : 'Sign In'}
        </h1>
        <p className="text-ash text-xs mb-6">
          {needsSetup
            ? 'Set up the administrator account for this corebooks instance.'
            : 'Sign in to continue to corebooks.'}
        </p>
        {error && <p className="text-red-400 text-xs mb-4">{error}</p>}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-ash text-xs block mb-1">Email</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required
              className="w-full bg-raised border border-rim rounded-sm px-3 py-2 text-chalk text-sm focus:outline-none focus:border-neon" />
          </div>
          <div>
            <label className="text-ash text-xs block mb-1">Password</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required
              className="w-full bg-raised border border-rim rounded-sm px-3 py-2 text-chalk text-sm focus:outline-none focus:border-neon" />
          </div>
          {needsSetup && (
            <div>
              <label className="text-ash text-xs block mb-1">Confirm Password</label>
              <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required
                className="w-full bg-raised border border-rim rounded-sm px-3 py-2 text-chalk text-sm focus:outline-none focus:border-neon" />
            </div>
          )}
          <button type="submit" disabled={loading}
            className="w-full bg-neon hover:bg-neon-dim text-void font-semibold py-2 rounded-sm text-sm transition-colors disabled:opacity-50">
            {loading ? 'Please wait…' : needsSetup ? 'Create Account' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Add auth gate to router**

In `src/ui/main.tsx`, wrap the app with an auth check:

```typescript
import { useState, useEffect } from 'react'
import LoginPage from './pages/LoginPage'
import { checkAuthStatus, getAuthToken } from './lib/auth'

function AuthGate({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<'loading' | 'login' | 'setup' | 'ok'>('loading')

  useEffect(() => {
    checkAuthStatus().then(({ active, needsSetup }) => {
      if (!active) { setStatus('ok'); return }
      if (needsSetup) { setStatus('setup'); return }
      if (getAuthToken()) { setStatus('ok'); return }
      setStatus('login')
    })
  }, [])

  if (status === 'loading') return <div className="h-screen bg-base" />
  if (status === 'setup') return <LoginPage needsSetup onSuccess={() => setStatus('ok')} />
  if (status === 'login') return <LoginPage needsSetup={false} onSuccess={() => setStatus('ok')} />
  return <>{children}</>
}
```

Wrap the `RouterProvider` (or `BrowserRouter`) with `<AuthGate>`.

- [ ] **Step 4: Type check**

```bash
npx tsc --project src/ui/tsconfig.json --noEmit
```
Expected: no errors

- [ ] **Step 5: Commit**

```bash
git add src/ui/pages/LoginPage.tsx src/ui/lib/auth.ts src/ui/main.tsx
git commit -m "feat: add login page and auth gate (PostgreSQL mode only)"
```

---

### Task 6: Users tab in Settings

**Files:**
- Modify: `src/ui/pages/SettingsPage.tsx`

- [ ] **Step 1: Add UsersSettings component**

This tab is only shown when auth is active (PostgreSQL mode). Add:

```typescript
function UsersSettings() {
  const [users, setUsers] = useState<Array<{ id: string; email: string; role: string; createdAt: string }>>([])
  const [newEmail, setNewEmail] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [newRole, setNewRole] = useState<'Viewer' | 'Bookkeeper'>('Viewer')
  const [adminPassword, setAdminPassword] = useState('')
  const [promotingId, setPromotingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const token = getAuthToken()
  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }

  async function load() {
    const res = await fetch('/auth/users', { headers })
    if (res.ok) setUsers(await res.json())
  }

  useEffect(() => { load() }, [])

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    const res = await fetch('/auth/users', {
      method: 'POST', headers,
      body: JSON.stringify({ email: newEmail, password: newPassword, role: newRole }),
    })
    if (!res.ok) { setError((await res.json()).error); return }
    setNewEmail(''); setNewPassword(''); load()
  }

  async function handlePromote(id: string) {
    setError(null)
    const res = await fetch(`/auth/users/${id}/promote`, {
      method: 'POST', headers,
      body: JSON.stringify({ adminPassword }),
    })
    if (!res.ok) { setError((await res.json()).error); return }
    setAdminPassword(''); setPromotingId(null); load()
  }

  async function handleDelete(id: string) {
    if (!confirm('Remove this user?')) return
    const res = await fetch(`/auth/users/${id}`, { method: 'DELETE', headers })
    if (!res.ok) { setError((await res.json()).error); return }
    load()
  }

  return (
    <div className="space-y-6 max-w-xl">
      {error && <p className="text-red-400 text-xs">{error}</p>}

      <div>
        <h3 className="text-chalk text-sm font-medium mb-3">Current Users</h3>
        <div className="space-y-1">
          {users.map((u) => (
            <div key={u.id} className="flex items-center justify-between py-2 border-b border-rim/40">
              <div>
                <span className="text-chalk text-sm">{u.email}</span>
                <span className={`ml-2 text-xs ${u.role === 'Admin' ? 'text-neon' : 'text-ash'}`}>{u.role}</span>
              </div>
              <div className="flex items-center gap-3">
                {u.role !== 'Admin' && (
                  <button
                    onClick={() => setPromotingId(promotingId === u.id ? null : u.id)}
                    className="text-ash hover:text-neon text-xs transition-colors"
                  >
                    Make Admin
                  </button>
                )}
                <button onClick={() => handleDelete(u.id)} className="text-ash hover:text-red-400 text-xs transition-colors">Remove</button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {promotingId && (
        <div className="bg-raised border border-amber-500/40 rounded-sm p-4 space-y-3">
          <p className="text-amber-400 text-xs">Confirm your admin password to promote this user to Admin.</p>
          <input type="password" value={adminPassword} onChange={(e) => setAdminPassword(e.target.value)}
            placeholder="Your password"
            className="w-full bg-surface border border-rim rounded-sm px-3 py-1.5 text-chalk text-sm focus:outline-none focus:border-neon" />
          <div className="flex gap-3">
            <button onClick={() => handlePromote(promotingId)}
              className="bg-neon hover:bg-neon-dim text-void text-xs font-semibold px-4 py-1.5 rounded-sm transition-colors">
              Confirm Promotion
            </button>
            <button onClick={() => setPromotingId(null)} className="text-ash hover:text-chalk text-xs transition-colors">Cancel</button>
          </div>
        </div>
      )}

      <div>
        <h3 className="text-chalk text-sm font-medium mb-3">Add User</h3>
        <form onSubmit={handleCreate} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <input type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)}
              placeholder="Email" required
              className="bg-raised border border-rim rounded-sm px-3 py-1.5 text-chalk text-sm focus:outline-none focus:border-neon" />
            <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Password" required
              className="bg-raised border border-rim rounded-sm px-3 py-1.5 text-chalk text-sm focus:outline-none focus:border-neon" />
          </div>
          <div className="flex items-center gap-3">
            <select value={newRole} onChange={(e) => setNewRole(e.target.value as 'Viewer' | 'Bookkeeper')}
              className="bg-raised border border-rim rounded-sm px-3 py-1.5 text-chalk text-sm focus:outline-none focus:border-neon">
              <option value="Viewer">Viewer</option>
              <option value="Bookkeeper">Bookkeeper</option>
            </select>
            <button type="submit"
              className="bg-neon hover:bg-neon-dim text-void text-xs font-semibold px-4 py-1.5 rounded-sm transition-colors">
              Add User
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
```

Add `"users"` tab (only rendered when auth is active) and `<UsersSettings />` for that tab.

- [ ] **Step 2: Type check + commit**

```bash
npx tsc --project src/ui/tsconfig.json --noEmit
git add src/ui/pages/SettingsPage.tsx
git commit -m "feat: add Users tab to Settings with role management and admin promotion"
```
