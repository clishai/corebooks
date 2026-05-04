# Phase 4: Period Close & Closing Entries Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users configure fiscal year end, close frequency, and a Retained Earnings account. A Period Status board shows Open/Ready/Closed periods. Clicking Close generates a draft closing entry for review and, on post, locks the period.

**Architecture:** New `PeriodConfig` Prisma model (singleton config row) and `ClosedPeriod` model (one row per locked period). A `closingService` generates the draft entry by reading report data. Period locking enforced in `entryRepository.postEntry` by checking if the entry date falls in a closed period. UI: new Accounting tab in Settings + `/extra/close-period` page.

**Tech Stack:** Prisma 7, Fastify 5, React 19, Vitest

---

### Task 1: Prisma schema — PeriodConfig and ClosedPeriod

**Files:**
- Modify: `prisma/schema.prisma`
- Modify: `src/db/ensureSchema.ts`

- [ ] **Step 1: Add models to schema.prisma**

```prisma
model PeriodConfig {
  id                     String  @id @default("singleton")
  fiscalYearEndMonth     Int     @default(12)   // 1–12
  fiscalYearEndDay       Int     @default(31)   // 1–31
  closeFrequency         String  @default("year-end")  // "year-end" | "month-end"
  retainedEarningsAcctId String?
}

model ClosedPeriod {
  id        String   @id @default(cuid())
  year      Int
  month     Int      // 1–12; for year-end closes use month = fiscalYearEndMonth
  closedAt  DateTime @default(now())
  entryId   String   // the JournalEntry id of the closing entry
}
```

- [ ] **Step 2: Regenerate Prisma client**

```bash
npx prisma generate
```

- [ ] **Step 3: Add tables to ensureSchema.ts**

```typescript
db.exec(`
  CREATE TABLE IF NOT EXISTS "PeriodConfig" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'singleton',
    "fiscalYearEndMonth" INTEGER NOT NULL DEFAULT 12,
    "fiscalYearEndDay" INTEGER NOT NULL DEFAULT 31,
    "closeFrequency" TEXT NOT NULL DEFAULT 'year-end',
    "retainedEarningsAcctId" TEXT
  )
`);
db.exec(`
  CREATE TABLE IF NOT EXISTS "ClosedPeriod" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "closedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "entryId" TEXT NOT NULL
  )
`);
```

- [ ] **Step 4: Type check**

```bash
npx tsc --noEmit
```
Expected: no errors

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma src/db/ensureSchema.ts
git commit -m "feat: add PeriodConfig and ClosedPeriod to schema"
```

---

### Task 2: Period repository

**Files:**
- Create: `src/db/repositories/periodRepository.ts`

- [ ] **Step 1: Write the file**

```typescript
// src/db/repositories/periodRepository.ts
import { getPrismaClient } from '../client.js'

export async function getPeriodConfig() {
  const prisma = getPrismaClient()
  const config = await prisma.periodConfig.findUnique({ where: { id: 'singleton' } })
  return config ?? {
    id: 'singleton',
    fiscalYearEndMonth: 12,
    fiscalYearEndDay: 31,
    closeFrequency: 'year-end',
    retainedEarningsAcctId: null,
  }
}

export async function savePeriodConfig(data: {
  fiscalYearEndMonth: number
  fiscalYearEndDay: number
  closeFrequency: string
  retainedEarningsAcctId: string | null
}) {
  const prisma = getPrismaClient()
  return prisma.periodConfig.upsert({
    where: { id: 'singleton' },
    create: { id: 'singleton', ...data },
    update: data,
  })
}

export async function getClosedPeriods() {
  const prisma = getPrismaClient()
  return prisma.closedPeriod.findMany({ orderBy: [{ year: 'desc' }, { month: 'desc' }] })
}

export async function isPeriodClosed(year: number, month: number): Promise<boolean> {
  const prisma = getPrismaClient()
  const found = await prisma.closedPeriod.findFirst({ where: { year, month } })
  return found !== null
}

export async function closePeriod(year: number, month: number, entryId: string) {
  const prisma = getPrismaClient()
  return prisma.closedPeriod.create({
    data: { id: crypto.randomUUID(), year, month, entryId },
  })
}
```

- [ ] **Step 2: Enforce period lock in entryRepository**

In `src/db/repositories/entryRepository.ts`, in the `postEntry` function, add a check before posting:

```typescript
import { isPeriodClosed } from './periodRepository.js'

// Inside postEntry, before prisma.journalEntry.update:
const entryDate = new Date(draft.date)
const locked = await isPeriodClosed(entryDate.getFullYear(), entryDate.getMonth() + 1)
if (locked) {
  throw new Error(`Period ${entryDate.getFullYear()}-${String(entryDate.getMonth() + 1).padStart(2, '0')} is closed. Use admin override to post to a locked period.`)
}
```

- [ ] **Step 3: Type check**

```bash
npx tsc --noEmit
```
Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add src/db/repositories/periodRepository.ts src/db/repositories/entryRepository.ts
git commit -m "feat: add period repository and period-lock enforcement in postEntry"
```

---

### Task 3: Closing service

**Files:**
- Create: `src/api/services/closingService.ts`

- [ ] **Step 1: Write the service**

```typescript
// src/api/services/closingService.ts
import { getPrismaClient } from '../../db/client.js'
import { getPeriodConfig, closePeriod } from '../../db/repositories/periodRepository.js'
import { createDraftEntry, postEntry } from '../../db/repositories/entryRepository.js'
import { listAccounts } from '../../db/repositories/accountRepository.js'
import { incomeStatement } from '../../core/engine/reporting.js'
import type { Ledger } from '../../core/engine/ledger.js'

export async function generateClosingEntry(year: number, month: number, ledger: Ledger) {
  const config = await getPeriodConfig()
  if (!config.retainedEarningsAcctId) {
    throw new Error('No Retained Earnings account configured. Set one in Settings → Accounting.')
  }

  const from = new Date(year, month - 1, 1)
  const to = new Date(year, month, 0)  // last day of month

  const accounts = await listAccounts()
  const accountMap = Object.fromEntries(accounts.map((a) => [a.id, a]))
  const statement = incomeStatement(ledger, accountMap as Parameters<typeof incomeStatement>[1], from, to)

  const lines: Array<{ accountId: string; type: 'debit' | 'credit'; amount: number }> = []

  // Debit each revenue account to zero it out
  for (const line of statement.revenueLines ?? []) {
    if (line.balance > 0) {
      lines.push({ accountId: line.accountId, type: 'debit', amount: line.balance })
    }
  }

  // Credit each expense account to zero it out
  for (const line of statement.expenseLines ?? []) {
    if (line.balance > 0) {
      lines.push({ accountId: line.accountId, type: 'credit', amount: line.balance })
    }
  }

  // Net difference to Retained Earnings
  const netIncome = statement.netIncome
  if (netIncome > 0) {
    lines.push({ accountId: config.retainedEarningsAcctId, type: 'credit', amount: netIncome })
  } else if (netIncome < 0) {
    lines.push({ accountId: config.retainedEarningsAcctId, type: 'debit', amount: Math.abs(netIncome) })
  }

  if (lines.length === 0) {
    throw new Error('No revenue or expense balances to close for this period.')
  }

  const memo = `Closing entry — ${year}-${String(month).padStart(2, '0')}`
  const draft = await createDraftEntry({ date: to, memo, lines })
  return draft
}

export async function postClosingEntry(draftId: string, year: number, month: number, ledger: Ledger) {
  const entry = await postEntry(draftId, ledger)
  await closePeriod(year, month, entry.id)
  return entry
}
```

- [ ] **Step 2: Type check**

```bash
npx tsc --noEmit
```
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/api/services/closingService.ts
git commit -m "feat: add closing entry generation service"
```

---

### Task 4: Period API routes

**Files:**
- Create: `src/api/routes/periods.ts`
- Modify: `src/api/server.ts`

- [ ] **Step 1: Write routes**

```typescript
// src/api/routes/periods.ts
import { FastifyPluginAsync } from 'fastify'
import { AppContext } from '../server.js'
import { getPeriodConfig, savePeriodConfig, getClosedPeriods } from '../../db/repositories/periodRepository.js'
import { generateClosingEntry, postClosingEntry } from '../services/closingService.js'

interface RouteOptions { context: AppContext }

export const periodRoutes: FastifyPluginAsync<RouteOptions> = async (app, opts) => {
  const { ledger } = opts.context

  app.get('/config', async () => getPeriodConfig())

  app.post<{ Body: Record<string, unknown> }>('/config', async (req, reply) => {
    const b = req.body
    if (typeof b['fiscalYearEndMonth'] !== 'number' || typeof b['fiscalYearEndDay'] !== 'number') {
      return reply.badRequest('fiscalYearEndMonth and fiscalYearEndDay are required numbers')
    }
    return savePeriodConfig({
      fiscalYearEndMonth: b['fiscalYearEndMonth'],
      fiscalYearEndDay: b['fiscalYearEndDay'],
      closeFrequency: (b['closeFrequency'] as string) ?? 'year-end',
      retainedEarningsAcctId: (b['retainedEarningsAcctId'] as string | null) ?? null,
    })
  })

  app.get('/closed', async () => getClosedPeriods())

  app.post<{ Body: Record<string, unknown> }>('/generate-closing', async (req, reply) => {
    const { year, month } = req.body as { year: number; month: number }
    if (!year || !month) return reply.badRequest('year and month are required')
    return generateClosingEntry(year, month, ledger)
  })

  app.post<{ Body: Record<string, unknown> }>('/post-closing', async (req, reply) => {
    const { draftId, year, month } = req.body as { draftId: string; year: number; month: number }
    if (!draftId || !year || !month) return reply.badRequest('draftId, year, and month are required')
    return postClosingEntry(draftId, year, month, ledger)
  })
}
```

- [ ] **Step 2: Register in server.ts**

```typescript
import { periodRoutes } from './routes/periods.js'
// inside buildServer:
app.register(periodRoutes, { prefix: '/periods', options: { context } })
```

- [ ] **Step 3: Add to Vite proxy in vite.config.ts**

```typescript
'/periods': { target: 'http://127.0.0.1:3000', changeOrigin: true },
```

- [ ] **Step 4: Type check**

```bash
npx tsc --noEmit
```
Expected: no errors

- [ ] **Step 5: Commit**

```bash
git add src/api/routes/periods.ts src/api/server.ts vite.config.ts
git commit -m "feat: add period config and closing entry API routes"
```

---

### Task 5: Period Close UI — Settings Accounting tab + ClosePeriodPage

**Files:**
- Modify: `src/ui/pages/SettingsPage.tsx`
- Create: `src/ui/pages/ClosePeriodPage.tsx`
- Modify: `src/ui/api/client.ts`
- Modify: `src/ui/main.tsx`

- [ ] **Step 1: Add client wrappers**

Add to `src/ui/api/client.ts`:

```typescript
export interface PeriodConfig {
  fiscalYearEndMonth: number
  fiscalYearEndDay: number
  closeFrequency: 'year-end' | 'month-end'
  retainedEarningsAcctId: string | null
}

export interface ClosedPeriod { id: string; year: number; month: number; closedAt: string; entryId: string }

export async function getPeriodConfig(): Promise<PeriodConfig> {
  return request('GET', '/periods/config')
}
export async function savePeriodConfig(data: PeriodConfig): Promise<PeriodConfig> {
  return request('POST', '/periods/config', data)
}
export async function getClosedPeriods(): Promise<ClosedPeriod[]> {
  return request('GET', '/periods/closed')
}
export async function generateClosingEntry(year: number, month: number) {
  return request('POST', '/periods/generate-closing', { year, month })
}
export async function postClosingEntry(draftId: string, year: number, month: number) {
  return request('POST', '/periods/post-closing', { draftId, year, month })
}
```

- [ ] **Step 2: Add Accounting tab to SettingsPage**

In `src/ui/pages/SettingsPage.tsx`, add a new `"accounting"` tab alongside the existing tabs. The tab renders an `AccountingSettings` component:

```typescript
function AccountingSettings() {
  const [config, setConfig] = useState<PeriodConfig | null>(null)
  const [accounts, setAccounts] = useState<Array<{ id: string; number: string; name: string; type: string }>>([])
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    Promise.all([getPeriodConfig(), listAccounts()]).then(([c, a]) => {
      setConfig(c)
      setAccounts(a)
    })
  }, [])

  if (!config) return <p className="text-ash text-sm">Loading...</p>

  const equityAccounts = accounts.filter((a) => a.type === 'Equity')

  async function handleSave() {
    if (!config) return
    setSaving(true)
    await savePeriodConfig(config)
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className="space-y-6 max-w-md">
      <div>
        <h3 className="text-chalk text-sm font-medium mb-3">Period Configuration</h3>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-ash text-xs block mb-1">Fiscal Year End Month</label>
              <select value={config.fiscalYearEndMonth}
                onChange={(e) => setConfig({ ...config, fiscalYearEndMonth: Number(e.target.value) })}
                className="w-full bg-raised border border-rim rounded-sm px-3 py-1.5 text-chalk text-sm focus:outline-none focus:border-neon">
                {[...Array(12)].map((_, i) => (
                  <option key={i + 1} value={i + 1}>
                    {new Date(2000, i).toLocaleString('default', { month: 'long' })}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-ash text-xs block mb-1">Fiscal Year End Day</label>
              <input type="number" min={1} max={31} value={config.fiscalYearEndDay}
                onChange={(e) => setConfig({ ...config, fiscalYearEndDay: Number(e.target.value) })}
                className="w-full bg-raised border border-rim rounded-sm px-3 py-1.5 text-chalk text-sm focus:outline-none focus:border-neon" />
            </div>
          </div>
          <div>
            <label className="text-ash text-xs block mb-1">Close Frequency</label>
            <select value={config.closeFrequency}
              onChange={(e) => setConfig({ ...config, closeFrequency: e.target.value as PeriodConfig['closeFrequency'] })}
              className="w-full bg-raised border border-rim rounded-sm px-3 py-1.5 text-chalk text-sm focus:outline-none focus:border-neon">
              <option value="year-end">Year-end only</option>
              <option value="month-end">Month-end + Year-end</option>
            </select>
          </div>
          <div>
            <label className="text-ash text-xs block mb-1">Retained Earnings Account</label>
            <select value={config.retainedEarningsAcctId ?? ''}
              onChange={(e) => setConfig({ ...config, retainedEarningsAcctId: e.target.value || null })}
              className="w-full bg-raised border border-rim rounded-sm px-3 py-1.5 text-chalk text-sm focus:outline-none focus:border-neon">
              <option value="">— Select account —</option>
              {equityAccounts.map((a) => <option key={a.id} value={a.id}>{a.number} — {a.name}</option>)}
            </select>
          </div>
        </div>
        <button onClick={handleSave} disabled={saving}
          className="mt-4 bg-neon hover:bg-neon-dim text-void text-xs font-semibold px-4 py-1.5 rounded-sm transition-colors disabled:opacity-50">
          {saved ? 'Saved!' : saving ? 'Saving…' : 'Save Configuration'}
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Write ClosePeriodPage**

```typescript
// src/ui/pages/ClosePeriodPage.tsx
import { useState, useEffect } from 'react'
import { getPeriodConfig, getClosedPeriods, generateClosingEntry, postClosingEntry, type PeriodConfig, type ClosedPeriod } from '../api/client'

function buildPeriodList(config: PeriodConfig, closed: ClosedPeriod[]): Array<{ year: number; month: number; status: 'Open' | 'Ready to Close' | 'Closed' }> {
  const now = new Date()
  const closedSet = new Set(closed.map((c) => `${c.year}-${c.month}`))
  const periods: Array<{ year: number; month: number; status: 'Open' | 'Ready to Close' | 'Closed' }> = []
  // Generate last 12 months
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const year = d.getFullYear()
    const month = d.getMonth() + 1
    const key = `${year}-${month}`
    const periodEndDate = new Date(year, month, 0)
    let status: 'Open' | 'Ready to Close' | 'Closed'
    if (closedSet.has(key)) {
      status = 'Closed'
    } else if (periodEndDate < now) {
      status = 'Ready to Close'
    } else {
      status = 'Open'
    }
    periods.push({ year, month, status })
  }
  return periods
}

export default function ClosePeriodPage() {
  const [config, setConfig] = useState<PeriodConfig | null>(null)
  const [closed, setClosed] = useState<ClosedPeriod[]>([])
  const [generating, setGenerating] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([getPeriodConfig(), getClosedPeriods()]).then(([c, cl]) => {
      setConfig(c)
      setClosed(cl)
    })
  }, [])

  if (!config) return <div className="p-6 text-ash text-sm">Loading...</div>
  if (!config.retainedEarningsAcctId) {
    return (
      <div className="p-6 max-w-xl">
        <h1 className="text-chalk font-semibold text-lg mb-3">Close Period</h1>
        <p className="text-ash text-sm">Configure a Retained Earnings account in <strong className="text-chalk">Settings → Accounting</strong> before closing periods.</p>
      </div>
    )
  }

  const periods = buildPeriodList(config, closed)

  async function handleClose(year: number, month: number) {
    setError(null)
    setGenerating(`${year}-${month}`)
    try {
      const draft = await generateClosingEntry(year, month)
      const confirmed = confirm(`Review the closing entry for ${year}-${String(month).padStart(2, '0')}.\n\nDraft ID: ${draft.id}\nMemo: ${draft.memo}\n\nPost this closing entry and lock the period?`)
      if (confirmed) {
        await postClosingEntry(draft.id, year, month)
        const newClosed = await getClosedPeriods()
        setClosed(newClosed)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to generate closing entry.')
    } finally {
      setGenerating(null)
    }
  }

  return (
    <div className="p-6 max-w-2xl">
      <h1 className="text-chalk font-semibold text-lg mb-1">Close Period</h1>
      <p className="text-ash text-sm mb-6">Close a period to zero out revenue and expense accounts into Retained Earnings. Closed periods are locked.</p>
      {error && <p className="text-red-400 text-sm mb-4">{error}</p>}
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="border-b border-rim text-ash text-xs uppercase tracking-widest">
            <th className="text-left py-2 px-3 font-medium">Period</th>
            <th className="text-left py-2 px-3 font-medium">Status</th>
            <th className="py-2 px-3" />
          </tr>
        </thead>
        <tbody>
          {periods.map(({ year, month, status }) => {
            const key = `${year}-${month}`
            const label = new Date(year, month - 1).toLocaleString('default', { month: 'long', year: 'numeric' })
            return (
              <tr key={key} className="border-b border-rim/40">
                <td className="py-2 px-3 text-chalk">{label}</td>
                <td className="py-2 px-3">
                  {status === 'Closed' && <span className="text-ash text-xs">Closed</span>}
                  {status === 'Open' && <span className="text-ash text-xs">Open</span>}
                  {status === 'Ready to Close' && <span className="text-neon text-xs">Ready to Close</span>}
                </td>
                <td className="py-2 px-3 text-right">
                  {status === 'Ready to Close' && (
                    <button
                      onClick={() => handleClose(year, month)}
                      disabled={generating === key}
                      className="text-neon hover:text-chalk text-xs transition-colors disabled:opacity-50"
                    >
                      {generating === key ? 'Generating…' : 'Close →'}
                    </button>
                  )}
                  {status === 'Closed' && <span className="text-ash text-xs">View</span>}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
```

- [ ] **Step 4: Register route in router**

Replace Phase 2 placeholder for `/extra/close-period`:
```typescript
import ClosePeriodPage from './pages/ClosePeriodPage'
// ...
{ path: 'extra/close-period', element: <ClosePeriodPage /> },
```

- [ ] **Step 5: Type check**

```bash
npx tsc --noEmit && npx tsc --project src/ui/tsconfig.json --noEmit
```
Expected: no errors

- [ ] **Step 6: Commit**

```bash
git add src/ui/pages/ClosePeriodPage.tsx src/ui/pages/SettingsPage.tsx src/ui/api/client.ts src/ui/main.tsx
git commit -m "feat: add Period Close page and Accounting settings tab"
```
