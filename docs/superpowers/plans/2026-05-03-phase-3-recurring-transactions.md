# Phase 3: Recurring Transactions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users define recurring journal entry templates (weekly/monthly/quarterly/annually/custom) that auto-generate drafts (or auto-post) on schedule. Electron checks on launch and once per day.

**Architecture:** New Prisma models `RecurringTemplate` + `RecurringLine`. New repository, API routes, and Electron daily-check service. UI under `/extra/recurring`. The recurring service calls the existing `saveDraft`/`postEntry` repository functions — no new core logic.

**Tech Stack:** Prisma 7, Fastify 5, React 19, Electron 41, Vitest

---

### Task 1: Add RecurringTemplate and RecurringLine to Prisma schema

**Files:**
- Modify: `prisma/schema.prisma`
- Modify: `src/db/ensureSchema.ts`

- [ ] **Step 1: Add models to schema.prisma**

Append to `prisma/schema.prisma`:

```prisma
enum RecurringSchedule {
  weekly
  monthly
  quarterly
  annually
  custom
}

model RecurringTemplate {
  id            String             @id @default(cuid())
  name          String
  memo          String
  paymentMethod String?
  schedule      RecurringSchedule
  customCron    String?
  nextDue       DateTime
  autoPost      Boolean            @default(false)
  lines         RecurringLine[]
  createdAt     DateTime           @default(now())
  updatedAt     DateTime           @updatedAt
}

model RecurringLine {
  id         String            @id @default(cuid())
  templateId String
  accountId  String
  type       LineType
  amount     Int
  template   RecurringTemplate @relation(fields: [templateId], references: [id], onDelete: Cascade)
  account    Account           @relation(fields: [accountId], references: [id])
}
```

Also add `recurringLines RecurringLine[]` to the existing `Account` model.

- [ ] **Step 2: Regenerate Prisma client**

```bash
npx prisma generate
```
Expected: client regenerated with new models

- [ ] **Step 3: Add tables to ensureSchema.ts**

In `src/db/ensureSchema.ts`, add after the existing `CREATE TABLE IF NOT EXISTS JournalLine` block:

```typescript
db.exec(`
  CREATE TABLE IF NOT EXISTS "RecurringTemplate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "memo" TEXT NOT NULL,
    "paymentMethod" TEXT,
    "schedule" TEXT NOT NULL,
    "customCron" TEXT,
    "nextDue" DATETIME NOT NULL,
    "autoPost" BOOLEAN NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )
`);
db.exec(`
  CREATE TABLE IF NOT EXISTS "RecurringLine" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "templateId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    FOREIGN KEY ("templateId") REFERENCES "RecurringTemplate"("id") ON DELETE CASCADE,
    FOREIGN KEY ("accountId") REFERENCES "Account"("id")
  )
`);
```

- [ ] **Step 4: Type check server**

```bash
npx tsc --noEmit
```
Expected: no errors

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma src/db/ensureSchema.ts
git commit -m "feat: add RecurringTemplate and RecurringLine to schema"
```

---

### Task 2: Recurring repository

**Files:**
- Create: `src/db/repositories/recurringRepository.ts`

- [ ] **Step 1: Write the file**

```typescript
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
  return prisma.recurringTemplate.create({
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
  return prisma.recurringTemplate.update({
    where: { id },
    data: { ...rest },
    include: { lines: true },
  })
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
    default:          next.setMonth(next.getMonth() + 1); break  // custom falls back to monthly
  }
  const prisma = getPrismaClient()
  await prisma.recurringTemplate.update({ where: { id }, data: { nextDue: next } })
  return next
}
```

- [ ] **Step 2: Type check**

```bash
npx tsc --noEmit
```
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/db/repositories/recurringRepository.ts
git commit -m "feat: add recurring template repository"
```

---

### Task 3: Recurring service (fires overdue templates)

**Files:**
- Create: `src/api/services/recurringService.ts`

- [ ] **Step 1: Write the service**

```typescript
// src/api/services/recurringService.ts
import { getOverdueTemplates, advanceNextDue } from '../../db/repositories/recurringRepository.js'
import { createDraftEntry, postEntry } from '../../db/repositories/entryRepository.js'
import type { Ledger } from '../../core/engine/ledger.js'

export async function fireOverdueTemplates(ledger: Ledger): Promise<number> {
  const overdue = await getOverdueTemplates()
  let fired = 0
  for (const template of overdue) {
    const lines = template.lines.map((l) => ({
      accountId: l.accountId,
      type: l.type as 'debit' | 'credit',
      amount: l.amount,
    }))
    const draft = await createDraftEntry({
      date: new Date(),
      memo: template.memo,
      paymentMethod: template.paymentMethod ?? undefined,
      lines,
    })
    if (template.autoPost) {
      await postEntry(draft.id, ledger)
    }
    await advanceNextDue(template.id, template.schedule, template.nextDue)
    fired++
  }
  return fired
}
```

- [ ] **Step 2: Type check**

```bash
npx tsc --noEmit
```
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/api/services/recurringService.ts
git commit -m "feat: add recurring service to fire overdue templates"
```

---

### Task 4: Recurring API routes

**Files:**
- Create: `src/api/routes/recurring.ts`
- Modify: `src/api/server.ts`

- [ ] **Step 1: Write the routes file**

```typescript
// src/api/routes/recurring.ts
import { FastifyPluginAsync } from 'fastify'
import { AppContext } from '../server.js'
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
```

- [ ] **Step 2: Register route in server.ts**

In `src/api/server.ts`, add import and registration:

```typescript
import { recurringRoutes } from './routes/recurring.js'
// ...inside buildServer, alongside other route registrations:
app.register(recurringRoutes, { prefix: '/recurring', options: { context } })
```

- [ ] **Step 3: Type check**

```bash
npx tsc --noEmit
```
Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add src/api/routes/recurring.ts src/api/server.ts
git commit -m "feat: add recurring API routes"
```

---

### Task 5: Wire Electron daily-check timer

**Files:**
- Modify: `src/electron/main.ts`

- [ ] **Step 1: Add the timer after server start**

In `src/electron/main.ts`, after the API server starts (after `await startServer(port)`), add:

```typescript
// Dynamic import to avoid circular deps and ensure server is ready
const { fireOverdueTemplates } = await import('../api/services/recurringService.js')

// Fire once on launch, then every 24 hours
async function checkRecurring() {
  try {
    const { ledger } = await import('../api/server.js')
    await fireOverdueTemplates(ledger)
  } catch (err) {
    console.error('[recurring] check failed:', err)
  }
}
await checkRecurring()
setInterval(checkRecurring, 24 * 60 * 60 * 1000)
```

Note: the exact import path for `ledger` depends on how `AppContext` is exported from `server.ts`. Check `src/api/server.ts` for how `ledger` is exposed and adjust the import accordingly.

- [ ] **Step 2: Type check**

```bash
npx tsc --noEmit
```
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/electron/main.ts
git commit -m "feat: add Electron daily recurring template check"
```

---

### Task 6: API client wrappers

**Files:**
- Modify: `src/ui/api/client.ts`

- [ ] **Step 1: Add recurring client methods**

Add to `src/ui/api/client.ts`:

```typescript
// --- Recurring Templates ---

export interface RecurringLineInput {
  accountId: string
  type: 'debit' | 'credit'
  amount: number
}

export interface RecurringTemplateInput {
  name: string
  memo: string
  paymentMethod?: string
  schedule: 'weekly' | 'monthly' | 'quarterly' | 'annually' | 'custom'
  customCron?: string
  nextDue: string  // ISO date string
  autoPost: boolean
  lines: RecurringLineInput[]
}

export interface RecurringTemplate extends RecurringTemplateInput {
  id: string
  createdAt: string
  updatedAt: string
}

export async function listRecurringTemplates(): Promise<RecurringTemplate[]> {
  return request('GET', '/recurring')
}

export async function createRecurringTemplate(input: RecurringTemplateInput): Promise<RecurringTemplate> {
  return request('POST', '/recurring', input)
}

export async function updateRecurringTemplate(id: string, input: Partial<RecurringTemplateInput>): Promise<RecurringTemplate> {
  return request('PATCH', `/recurring/${id}`, input)
}

export async function deleteRecurringTemplate(id: string): Promise<void> {
  await request('DELETE', `/recurring/${id}`)
}
```

Also add `/recurring` to the Vite dev proxy in `vite.config.ts`:
```typescript
'/recurring': { target: 'http://127.0.0.1:3000', changeOrigin: true },
```

- [ ] **Step 2: Type check UI**

```bash
npx tsc --project src/ui/tsconfig.json --noEmit
```
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/ui/api/client.ts vite.config.ts
git commit -m "feat: add recurring API client wrappers"
```

---

### Task 7: RecurringPage and RecurringTemplateModal UI

**Files:**
- Create: `src/ui/pages/RecurringPage.tsx`
- Create: `src/ui/components/RecurringTemplateModal.tsx`
- Modify: `src/ui/main.tsx` (router)

- [ ] **Step 1: Write RecurringPage**

```typescript
// src/ui/pages/RecurringPage.tsx
import { useState, useEffect } from 'react'
import { listRecurringTemplates, deleteRecurringTemplate, type RecurringTemplate } from '../api/client'
import RecurringTemplateModal from '../components/RecurringTemplateModal'

export default function RecurringPage() {
  const [templates, setTemplates] = useState<RecurringTemplate[]>([])
  const [editTarget, setEditTarget] = useState<RecurringTemplate | null>(null)
  const [showModal, setShowModal] = useState(false)

  async function load() {
    setTemplates(await listRecurringTemplates())
  }

  useEffect(() => { load() }, [])

  async function handleDelete(id: string) {
    if (!confirm('Delete this recurring template?')) return
    await deleteRecurringTemplate(id)
    load()
  }

  return (
    <div className="p-6 max-w-3xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-chalk font-semibold text-lg">Recurring Transactions</h1>
        <button
          onClick={() => { setEditTarget(null); setShowModal(true) }}
          className="bg-neon hover:bg-neon-dim text-void text-xs font-semibold px-3 py-1.5 rounded-sm transition-colors"
        >
          + New Template
        </button>
      </div>

      {templates.length === 0 && (
        <p className="text-ash text-sm">No recurring templates yet. Create one to auto-generate entries on a schedule.</p>
      )}

      {templates.length > 0 && (
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b border-rim text-ash text-xs uppercase tracking-widest">
              <th className="text-left py-2 px-3 font-medium">Name</th>
              <th className="text-left py-2 px-3 font-medium">Schedule</th>
              <th className="text-left py-2 px-3 font-medium">Next Due</th>
              <th className="text-left py-2 px-3 font-medium">Auto-Post</th>
              <th className="py-2 px-3" />
            </tr>
          </thead>
          <tbody>
            {templates.map((t) => (
              <tr key={t.id} className="border-b border-rim/40 hover:bg-surface group">
                <td className="py-2 px-3 text-chalk">{t.name}</td>
                <td className="py-2 px-3 text-ash capitalize">{t.schedule}</td>
                <td className="py-2 px-3 text-ash">{new Date(t.nextDue).toLocaleDateString()}</td>
                <td className="py-2 px-3">
                  {t.autoPost
                    ? <span className="text-neon text-xs">Auto-post</span>
                    : <span className="text-ash text-xs">Draft</span>}
                </td>
                <td className="py-2 px-3 text-right">
                  <button
                    onClick={() => { setEditTarget(t); setShowModal(true) }}
                    className="text-ash hover:text-chalk text-xs mr-3 opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDelete(t.id)}
                    className="text-ash hover:text-red-400 text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {showModal && (
        <RecurringTemplateModal
          initial={editTarget}
          onClose={() => setShowModal(false)}
          onSaved={() => { setShowModal(false); load() }}
        />
      )}
    </div>
  )
}
```

- [ ] **Step 2: Write RecurringTemplateModal**

```typescript
// src/ui/components/RecurringTemplateModal.tsx
import { useState, useEffect } from 'react'
import { listAccounts, createRecurringTemplate, updateRecurringTemplate, type RecurringTemplate } from '../api/client'

interface Props {
  initial: RecurringTemplate | null
  onClose: () => void
  onSaved: () => void
}

interface LineRow { accountId: string; type: 'debit' | 'credit'; amount: string }

export default function RecurringTemplateModal({ initial, onClose, onSaved }: Props) {
  const [accounts, setAccounts] = useState<Array<{ id: string; number: string; name: string }>>([])
  const [name, setName] = useState(initial?.name ?? '')
  const [memo, setMemo] = useState(initial?.memo ?? '')
  const [paymentMethod, setPaymentMethod] = useState(initial?.paymentMethod ?? '')
  const [schedule, setSchedule] = useState<'weekly'|'monthly'|'quarterly'|'annually'|'custom'>(initial?.schedule ?? 'monthly')
  const [nextDue, setNextDue] = useState(initial?.nextDue?.slice(0, 10) ?? new Date().toISOString().slice(0, 10))
  const [autoPost, setAutoPost] = useState(initial?.autoPost ?? false)
  const [lines, setLines] = useState<LineRow[]>(
    initial?.lines?.map((l) => ({ accountId: l.accountId, type: l.type, amount: String(l.amount) })) ??
    [{ accountId: '', type: 'debit', amount: '' }, { accountId: '', type: 'credit', amount: '' }]
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    listAccounts().then(setAccounts)
  }, [])

  function updateLine(i: number, field: keyof LineRow, value: string) {
    setLines((prev) => prev.map((l, idx) => idx === i ? { ...l, [field]: value } : l))
  }

  async function handleSave() {
    setError(null)
    if (!name.trim() || !memo.trim()) { setError('Name and memo are required.'); return }
    const parsedLines = lines.map((l) => ({ ...l, amount: parseFloat(l.amount) }))
    if (parsedLines.some((l) => !l.accountId || isNaN(l.amount) || l.amount <= 0)) {
      setError('All lines need an account and a positive amount.'); return
    }
    setSaving(true)
    try {
      const payload = { name, memo, paymentMethod: paymentMethod || undefined, schedule, nextDue, autoPost, lines: parsedLines }
      if (initial) {
        await updateRecurringTemplate(initial.id, payload)
      } else {
        await createRecurringTemplate(payload)
      }
      onSaved()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-surface border border-rim rounded-sm w-full max-w-lg p-6 space-y-4">
        <h2 className="text-chalk font-semibold">{initial ? 'Edit Template' : 'New Recurring Template'}</h2>

        {error && <p className="text-red-400 text-xs">{error}</p>}

        <div className="space-y-3">
          <div>
            <label className="text-ash text-xs block mb-1">Template Name</label>
            <input value={name} onChange={(e) => setName(e.target.value)}
              className="w-full bg-raised border border-rim rounded-sm px-3 py-1.5 text-chalk text-sm focus:outline-none focus:border-neon" />
          </div>
          <div>
            <label className="text-ash text-xs block mb-1">Memo</label>
            <input value={memo} onChange={(e) => setMemo(e.target.value)}
              className="w-full bg-raised border border-rim rounded-sm px-3 py-1.5 text-chalk text-sm focus:outline-none focus:border-neon" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-ash text-xs block mb-1">Schedule</label>
              <select value={schedule} onChange={(e) => setSchedule(e.target.value as typeof schedule)}
                className="w-full bg-raised border border-rim rounded-sm px-3 py-1.5 text-chalk text-sm focus:outline-none focus:border-neon">
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
                <option value="quarterly">Quarterly</option>
                <option value="annually">Annually</option>
                <option value="custom">Custom</option>
              </select>
            </div>
            <div>
              <label className="text-ash text-xs block mb-1">Next Due</label>
              <input type="date" value={nextDue} onChange={(e) => setNextDue(e.target.value)}
                className="w-full bg-raised border border-rim rounded-sm px-3 py-1.5 text-chalk text-sm focus:outline-none focus:border-neon" />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <input type="checkbox" id="autoPost" checked={autoPost} onChange={(e) => setAutoPost(e.target.checked)}
              className="accent-neon" />
            <label htmlFor="autoPost" className="text-ash text-xs">Auto-post (skip draft review)</label>
          </div>
        </div>

        <div>
          <label className="text-ash text-xs block mb-2">Lines</label>
          <div className="space-y-2">
            {lines.map((line, i) => (
              <div key={i} className="grid grid-cols-[1fr_80px_90px_24px] gap-2 items-center">
                <select value={line.accountId} onChange={(e) => updateLine(i, 'accountId', e.target.value)}
                  className="bg-raised border border-rim rounded-sm px-2 py-1 text-chalk text-xs focus:outline-none focus:border-neon">
                  <option value="">Account</option>
                  {accounts.map((a) => <option key={a.id} value={a.id}>{a.number} — {a.name}</option>)}
                </select>
                <select value={line.type} onChange={(e) => updateLine(i, 'type', e.target.value as 'debit'|'credit')}
                  className="bg-raised border border-rim rounded-sm px-2 py-1 text-chalk text-xs focus:outline-none focus:border-neon">
                  <option value="debit">Dr</option>
                  <option value="credit">Cr</option>
                </select>
                <input type="number" step="0.01" min="0" value={line.amount}
                  onChange={(e) => updateLine(i, 'amount', e.target.value)}
                  placeholder="0.00"
                  className="bg-raised border border-rim rounded-sm px-2 py-1 text-chalk text-xs focus:outline-none focus:border-neon text-right" />
                <button onClick={() => setLines((prev) => prev.filter((_, idx) => idx !== i))}
                  className="text-ash hover:text-red-400 text-xs">✕</button>
              </div>
            ))}
          </div>
          <button onClick={() => setLines((prev) => [...prev, { accountId: '', type: 'debit', amount: '' }])}
            className="text-ash hover:text-chalk text-xs mt-2 transition-colors">+ Add line</button>
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <button onClick={onClose} className="text-ash hover:text-chalk text-sm transition-colors">Cancel</button>
          <button onClick={handleSave} disabled={saving}
            className="bg-neon hover:bg-neon-dim text-void text-xs font-semibold px-4 py-1.5 rounded-sm transition-colors disabled:opacity-50">
            {saving ? 'Saving…' : 'Save Template'}
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Register route in router**

Replace the Phase 2 placeholder for `/extra/recurring`:
```typescript
import RecurringPage from './pages/RecurringPage'
// ...
{ path: 'extra/recurring', element: <RecurringPage /> },
```

- [ ] **Step 4: Type check**

```bash
npx tsc --project src/ui/tsconfig.json --noEmit
```
Expected: no errors

- [ ] **Step 5: Commit**

```bash
git add src/ui/pages/RecurringPage.tsx src/ui/components/RecurringTemplateModal.tsx src/ui/main.tsx
git commit -m "feat: add Recurring Transactions page and template modal"
```

---

### Task 8: Tests for recurring repository

**Files:**
- Create: `tests/db/recurringRepository.test.ts`

- [ ] **Step 1: Write tests**

```typescript
// tests/db/recurringRepository.test.ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { createTestDb, destroyTestDb, type TestDb } from '../helpers/testDb'
import {
  createRecurringTemplate,
  listRecurringTemplates,
  getRecurringTemplate,
  deleteRecurringTemplate,
  getOverdueTemplates,
  advanceNextDue,
} from '../../src/db/repositories/recurringRepository'

let db: TestDb

beforeAll(async () => { db = await createTestDb() })
afterAll(async () => { await destroyTestDb(db) })
beforeEach(async () => {
  const { getPrismaClient } = await import('../../src/db/client')
  const prisma = getPrismaClient()
  await prisma.recurringLine.deleteMany({})
  await prisma.recurringTemplate.deleteMany({})
  await prisma.journalLine.deleteMany({})
  await prisma.journalEntry.deleteMany({})
  await prisma.account.deleteMany({})
})

async function seedAccount() {
  const { getPrismaClient } = await import('../../src/db/client')
  const prisma = getPrismaClient()
  return prisma.account.create({
    data: { id: 'acc1', number: '1000', name: 'Cash', type: 'Asset', normalBalance: 'debit', isContra: false },
  })
}

describe('recurring repository', () => {
  it('creates and retrieves a template', async () => {
    await seedAccount()
    const t = await createRecurringTemplate({
      name: 'Monthly Rent',
      memo: 'Rent payment',
      schedule: 'monthly',
      nextDue: new Date('2026-06-01'),
      autoPost: false,
      lines: [{ accountId: 'acc1', type: 'debit', amount: 1000 }],
    })
    expect(t.name).toBe('Monthly Rent')
    expect(t.lines[0].amount).toBe(1000)
  })

  it('lists all templates', async () => {
    await seedAccount()
    await createRecurringTemplate({ name: 'T1', memo: 'm', schedule: 'monthly', nextDue: new Date(), autoPost: false, lines: [{ accountId: 'acc1', type: 'debit', amount: 100 }] })
    await createRecurringTemplate({ name: 'T2', memo: 'm', schedule: 'weekly', nextDue: new Date(), autoPost: false, lines: [{ accountId: 'acc1', type: 'credit', amount: 100 }] })
    const list = await listRecurringTemplates()
    expect(list.length).toBe(2)
  })

  it('returns overdue templates', async () => {
    await seedAccount()
    const past = new Date(Date.now() - 86400000)
    const future = new Date(Date.now() + 86400000)
    await createRecurringTemplate({ name: 'Past', memo: 'm', schedule: 'monthly', nextDue: past, autoPost: false, lines: [{ accountId: 'acc1', type: 'debit', amount: 50 }] })
    await createRecurringTemplate({ name: 'Future', memo: 'm', schedule: 'monthly', nextDue: future, autoPost: false, lines: [{ accountId: 'acc1', type: 'debit', amount: 50 }] })
    const overdue = await getOverdueTemplates()
    expect(overdue.length).toBe(1)
    expect(overdue[0].name).toBe('Past')
  })

  it('advances nextDue by one month', async () => {
    await seedAccount()
    const due = new Date('2026-01-15')
    const t = await createRecurringTemplate({ name: 'T', memo: 'm', schedule: 'monthly', nextDue: due, autoPost: false, lines: [{ accountId: 'acc1', type: 'debit', amount: 100 }] })
    const next = await advanceNextDue(t.id, 'monthly', due)
    expect(next.getMonth()).toBe(1) // February
  })

  it('deletes a template', async () => {
    await seedAccount()
    const t = await createRecurringTemplate({ name: 'T', memo: 'm', schedule: 'monthly', nextDue: new Date(), autoPost: false, lines: [{ accountId: 'acc1', type: 'debit', amount: 100 }] })
    await deleteRecurringTemplate(t.id)
    expect(await getRecurringTemplate(t.id)).toBeNull()
  })
})
```

- [ ] **Step 2: Run tests**

```bash
npm test tests/db/recurringRepository.test.ts
```
Expected: 5 tests pass

- [ ] **Step 3: Commit**

```bash
git add tests/db/recurringRepository.test.ts
git commit -m "test: add recurring repository tests"
```
