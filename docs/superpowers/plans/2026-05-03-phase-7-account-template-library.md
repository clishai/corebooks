# Phase 7: Account Template Library Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a static library of ~40 common accounts. Users add them via a drawer on the Chart of Accounts page, a curated subset in the Onboarding Wizard, or via Settings → Accounts. Nothing is ever auto-added.

**Architecture:** `src/ui/lib/accountTemplates.ts` is a static array. `AccountLibraryDrawer` renders it. No API or schema changes — adding a template just calls the existing `POST /accounts` endpoint.

**Tech Stack:** React 19, Tailwind v4

---

### Task 1: Account template library data

**Files:**
- Create: `src/ui/lib/accountTemplates.ts`

- [ ] **Step 1: Write the file**

```typescript
// src/ui/lib/accountTemplates.ts

export interface AccountTemplate {
  number: string
  name: string
  type: 'Asset' | 'Liability' | 'Equity' | 'Revenue' | 'Expense'
  normalBalance: 'debit' | 'credit'
  classification?: 'current' | 'non-current'
  isContra: boolean
  contraTo?: 'Asset' | 'Liability' | 'Equity' | 'Revenue' | 'Expense'
  description: string
  businessTypes?: Array<'freelancer' | 'service' | 'product' | 'nonprofit' | 'other'>
}

export const ACCOUNT_TEMPLATES: AccountTemplate[] = [
  // ── Assets ──────────────────────────────────────────────────
  { number: '1000', name: 'Cash',                        type: 'Asset',    normalBalance: 'debit',  classification: 'current',     isContra: false, description: 'Physical cash on hand.',                                        businessTypes: ['freelancer','service','product','nonprofit','other'] },
  { number: '1010', name: 'Checking Account',            type: 'Asset',    normalBalance: 'debit',  classification: 'current',     isContra: false, description: 'Primary business checking account.',                            businessTypes: ['freelancer','service','product','nonprofit','other'] },
  { number: '1020', name: 'Savings Account',             type: 'Asset',    normalBalance: 'debit',  classification: 'current',     isContra: false, description: 'Business savings or reserve account.',                          businessTypes: ['freelancer','service','product','nonprofit','other'] },
  { number: '1100', name: 'Petty Cash',                  type: 'Asset',    normalBalance: 'debit',  classification: 'current',     isContra: false, description: 'Small cash fund for minor expenses.',                           businessTypes: ['service','product','nonprofit'] },
  { number: '1200', name: 'Accounts Receivable',         type: 'Asset',    normalBalance: 'debit',  classification: 'current',     isContra: false, description: 'Money customers owe you for goods or services delivered.',      businessTypes: ['service','product','nonprofit'] },
  { number: '1300', name: 'Prepaid Expenses',            type: 'Asset',    normalBalance: 'debit',  classification: 'current',     isContra: false, description: 'Expenses paid in advance (insurance, subscriptions).',          businessTypes: ['service','product','nonprofit','other'] },
  { number: '1400', name: 'Inventory',                   type: 'Asset',    normalBalance: 'debit',  classification: 'current',     isContra: false, description: 'Value of goods held for sale.',                                 businessTypes: ['product'] },
  { number: '1500', name: 'Equipment',                   type: 'Asset',    normalBalance: 'debit',  classification: 'non-current', isContra: false, description: 'Machinery, computers, and tools used in operations.',           businessTypes: ['service','product','nonprofit'] },
  { number: '1510', name: 'Accumulated Depreciation — Equipment', type: 'Asset', normalBalance: 'credit', classification: 'non-current', isContra: true, contraTo: 'Asset', description: 'Total depreciation recorded against Equipment to date.' },
  { number: '1600', name: 'Vehicles',                    type: 'Asset',    normalBalance: 'debit',  classification: 'non-current', isContra: false, description: 'Company-owned vehicles.',                                       businessTypes: ['product','service'] },
  { number: '1610', name: 'Accumulated Depreciation — Vehicles', type: 'Asset', normalBalance: 'credit', classification: 'non-current', isContra: true, contraTo: 'Asset', description: 'Total depreciation recorded against Vehicles.' },
  { number: '1700', name: 'Land',                        type: 'Asset',    normalBalance: 'debit',  classification: 'non-current', isContra: false, description: 'Land owned by the business (does not depreciate).' },
  { number: '1800', name: 'Buildings',                   type: 'Asset',    normalBalance: 'debit',  classification: 'non-current', isContra: false, description: 'Structures owned by the business.' },
  { number: '1810', name: 'Accumulated Depreciation — Buildings', type: 'Asset', normalBalance: 'credit', classification: 'non-current', isContra: true, contraTo: 'Asset', description: 'Total depreciation recorded against Buildings.' },

  // ── Liabilities ─────────────────────────────────────────────
  { number: '2000', name: 'Accounts Payable',            type: 'Liability', normalBalance: 'credit', classification: 'current',     isContra: false, description: 'Money owed to suppliers and vendors.',                          businessTypes: ['service','product','nonprofit','other'] },
  { number: '2100', name: 'Accrued Liabilities',         type: 'Liability', normalBalance: 'credit', classification: 'current',     isContra: false, description: 'Expenses incurred but not yet paid (wages, utilities).',        businessTypes: ['service','product','nonprofit'] },
  { number: '2200', name: 'Unearned Revenue',            type: 'Liability', normalBalance: 'credit', classification: 'current',     isContra: false, description: 'Payments received before delivering the goods or service.',      businessTypes: ['service','product','nonprofit'] },
  { number: '2300', name: 'Credit Card Payable',         type: 'Liability', normalBalance: 'credit', classification: 'current',     isContra: false, description: 'Outstanding balance on business credit cards.',                  businessTypes: ['freelancer','service','product','nonprofit','other'] },
  { number: '2400', name: 'Short-term Loans Payable',    type: 'Liability', normalBalance: 'credit', classification: 'current',     isContra: false, description: 'Loans due within 12 months.',                                   businessTypes: ['service','product','nonprofit'] },
  { number: '2500', name: 'Sales Tax Payable',           type: 'Liability', normalBalance: 'credit', classification: 'current',     isContra: false, description: 'Sales tax collected from customers, owed to the government.',    businessTypes: ['product'] },
  { number: '2700', name: 'Long-term Loans Payable',     type: 'Liability', normalBalance: 'credit', classification: 'non-current', isContra: false, description: 'Loans due beyond 12 months.',                                   businessTypes: ['service','product','nonprofit'] },
  { number: '2800', name: 'Deferred Revenue',            type: 'Liability', normalBalance: 'credit', classification: 'non-current', isContra: false, description: 'Long-term deferred revenue not expected to be earned within a year.' },

  // ── Equity ──────────────────────────────────────────────────
  { number: '3000', name: "Owner's Equity",              type: 'Equity',   normalBalance: 'credit', isContra: false, description: "The owner's permanent investment in the business.",                businessTypes: ['freelancer','other'] },
  { number: '3100', name: 'Common Stock',                type: 'Equity',   normalBalance: 'credit', isContra: false, description: 'Capital raised by issuing shares.',                                businessTypes: ['service','product'] },
  { number: '3200', name: 'Retained Earnings',           type: 'Equity',   normalBalance: 'credit', isContra: false, description: 'Cumulative net income kept in the business after distributions.',   businessTypes: ['freelancer','service','product','nonprofit','other'] },
  { number: '3300', name: "Owner's Draw",                type: 'Equity',   normalBalance: 'debit',  isContra: true, contraTo: 'Equity', description: "Money the owner withdraws for personal use. Reduces equity.",   businessTypes: ['freelancer'] },
  { number: '3400', name: 'Net Assets',                  type: 'Equity',   normalBalance: 'credit', isContra: false, description: 'For nonprofits: total assets minus total liabilities.',               businessTypes: ['nonprofit'] },

  // ── Revenue ─────────────────────────────────────────────────
  { number: '4000', name: 'Sales Revenue',               type: 'Revenue',  normalBalance: 'credit', isContra: false, description: 'Income from selling goods.',                                         businessTypes: ['product'] },
  { number: '4100', name: 'Service Revenue',             type: 'Revenue',  normalBalance: 'credit', isContra: false, description: 'Income from providing services.',                                    businessTypes: ['freelancer','service','nonprofit','other'] },
  { number: '4200', name: 'Interest Income',             type: 'Revenue',  normalBalance: 'credit', isContra: false, description: 'Interest earned on bank accounts or loans made.',                    businessTypes: ['service','product','nonprofit','other'] },
  { number: '4300', name: 'Other Income',                type: 'Revenue',  normalBalance: 'credit', isContra: false, description: 'Miscellaneous income not classified elsewhere.',                      businessTypes: ['freelancer','service','product','nonprofit','other'] },
  { number: '4400', name: 'Grant Revenue',               type: 'Revenue',  normalBalance: 'credit', isContra: false, description: 'Income from grants and donations.',                                  businessTypes: ['nonprofit'] },
  { number: '4500', name: 'Membership Dues',             type: 'Revenue',  normalBalance: 'credit', isContra: false, description: 'Income from membership fees.',                                       businessTypes: ['nonprofit'] },

  // ── Expenses ────────────────────────────────────────────────
  { number: '5000', name: 'Cost of Goods Sold',          type: 'Expense',  normalBalance: 'debit',  isContra: false, description: 'Direct cost of producing the goods sold.',                           businessTypes: ['product'] },
  { number: '5100', name: 'Wages and Salaries Expense',  type: 'Expense',  normalBalance: 'debit',  isContra: false, description: 'Employee compensation costs.',                                        businessTypes: ['service','product','nonprofit'] },
  { number: '5200', name: 'Rent Expense',                type: 'Expense',  normalBalance: 'debit',  isContra: false, description: 'Office, warehouse, or retail space lease payments.',                  businessTypes: ['service','product','nonprofit','other'] },
  { number: '5300', name: 'Utilities Expense',           type: 'Expense',  normalBalance: 'debit',  isContra: false, description: 'Electricity, water, internet, and gas costs.',                        businessTypes: ['service','product','nonprofit','other'] },
  { number: '5400', name: 'Depreciation Expense',        type: 'Expense',  normalBalance: 'debit',  isContra: false, description: 'Periodic allocation of the cost of long-lived assets.',               businessTypes: ['service','product','nonprofit'] },
  { number: '5500', name: 'Insurance Expense',           type: 'Expense',  normalBalance: 'debit',  isContra: false, description: 'Business insurance premiums.',                                        businessTypes: ['freelancer','service','product','nonprofit','other'] },
  { number: '5600', name: 'Advertising Expense',         type: 'Expense',  normalBalance: 'debit',  isContra: false, description: 'Marketing and advertising costs.',                                    businessTypes: ['service','product'] },
  { number: '5700', name: 'Office Supplies Expense',     type: 'Expense',  normalBalance: 'debit',  isContra: false, description: 'Paper, printer ink, and other consumable supplies.',                  businessTypes: ['freelancer','service','product','nonprofit','other'] },
  { number: '5800', name: 'Professional Services Expense',type:'Expense',  normalBalance: 'debit',  isContra: false, description: 'Accounting, legal, and consulting fees.',                             businessTypes: ['freelancer','service','product','nonprofit','other'] },
  { number: '5900', name: 'Travel and Entertainment Expense', type: 'Expense', normalBalance: 'debit', isContra: false, description: 'Business travel, meals, and client entertainment.',               businessTypes: ['service','product'] },
  { number: '5950', name: 'Miscellaneous Expense',       type: 'Expense',  normalBalance: 'debit',  isContra: false, description: 'Small expenses that do not fit other categories.',                    businessTypes: ['freelancer','service','product','nonprofit','other'] },
]

export function getTemplatesForBusinessType(type: string): AccountTemplate[] {
  return ACCOUNT_TEMPLATES.filter(
    (t) => !t.businessTypes || t.businessTypes.includes(type as AccountTemplate['businessTypes'][0])
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/ui/lib/accountTemplates.ts
git commit -m "feat: add account template library with 42 common accounts"
```

---

### Task 2: AccountLibraryDrawer component

**Files:**
- Create: `src/ui/components/AccountLibraryDrawer.tsx`

- [ ] **Step 1: Write the component**

```typescript
// src/ui/components/AccountLibraryDrawer.tsx
import { useState } from 'react'
import { ACCOUNT_TEMPLATES, type AccountTemplate } from '../lib/accountTemplates'
import { createAccount } from '../api/client'

interface Props {
  existingNumbers: Set<string>
  onClose: () => void
  onAdded: () => void
}

const GROUPS: Array<{ label: string; type: AccountTemplate['type'] }> = [
  { label: 'Assets',      type: 'Asset' },
  { label: 'Liabilities', type: 'Liability' },
  { label: 'Equity',      type: 'Equity' },
  { label: 'Revenue',     type: 'Revenue' },
  { label: 'Expenses',    type: 'Expense' },
]

export default function AccountLibraryDrawer({ existingNumbers, onClose, onAdded }: Props) {
  const [adding, setAdding] = useState<Set<string>>(new Set())
  const [added, setAdded] = useState<Set<string>>(new Set())

  async function handleAdd(template: AccountTemplate) {
    setAdding((prev) => new Set(prev).add(template.number))
    try {
      await createAccount({
        number: template.number,
        name: template.name,
        type: template.type,
        normalBalance: template.normalBalance,
        isContra: template.isContra,
        contraTo: template.contraTo,
        classification: template.classification,
      })
      setAdded((prev) => new Set(prev).add(template.number))
      onAdded()
    } finally {
      setAdding((prev) => { const next = new Set(prev); next.delete(template.number); return next })
    }
  }

  async function handleAddAll(type: AccountTemplate['type']) {
    const templates = ACCOUNT_TEMPLATES.filter(
      (t) => t.type === type && !existingNumbers.has(t.number) && !added.has(t.number)
    )
    for (const t of templates) await handleAdd(t)
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex justify-end" onClick={onClose}>
      <div
        className="w-96 h-full bg-void border-l border-rim overflow-y-auto flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-rim shrink-0">
          <h2 className="text-chalk font-semibold text-sm">Account Library</h2>
          <button onClick={onClose} className="text-ash hover:text-chalk text-sm transition-colors">✕</button>
        </div>
        <p className="text-ash text-xs px-5 py-3 border-b border-rim">
          Click ADD+ to add an account to your chart of accounts. All accounts are fully editable after adding.
        </p>
        <div className="flex-1 overflow-y-auto">
          {GROUPS.map(({ label, type }) => {
            const templates = ACCOUNT_TEMPLATES.filter((t) => t.type === type)
            return (
              <div key={type}>
                <div className="flex items-center justify-between px-5 py-2 bg-base sticky top-0">
                  <span className="text-neon text-[10px] font-semibold uppercase tracking-widest">{label}</span>
                  <button
                    onClick={() => handleAddAll(type)}
                    className="text-ash hover:text-neon text-[10px] uppercase tracking-wide transition-colors"
                  >
                    Add All
                  </button>
                </div>
                {templates.map((t) => {
                  const alreadyExists = existingNumbers.has(t.number) || added.has(t.number)
                  const isAdding = adding.has(t.number)
                  return (
                    <div key={t.number} className="flex items-start justify-between px-5 py-2.5 border-b border-rim/30 hover:bg-surface group">
                      <div className="flex-1 min-w-0 mr-3">
                        <div className="flex items-center gap-2">
                          <span className="text-ash text-xs font-mono">{t.number}</span>
                          <span className="text-chalk text-xs truncate">{t.name}</span>
                          {t.isContra && <span className="text-violet text-[10px]">contra</span>}
                        </div>
                        <p className="text-ash text-[10px] mt-0.5 line-clamp-1">{t.description}</p>
                      </div>
                      <button
                        onClick={() => !alreadyExists && handleAdd(t)}
                        disabled={alreadyExists || isAdding}
                        className={`text-[10px] font-semibold shrink-0 px-2 py-1 rounded-sm border transition-colors ${
                          alreadyExists
                            ? 'border-rim text-ash cursor-default'
                            : 'border-neon text-neon hover:bg-neon hover:text-void'
                        }`}
                      >
                        {alreadyExists ? 'Added' : isAdding ? '…' : 'ADD+'}
                      </button>
                    </div>
                  )
                })}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/ui/components/AccountLibraryDrawer.tsx
git commit -m "feat: add AccountLibraryDrawer component"
```

---

### Task 3: Wire into AccountsPage

**Files:**
- Modify: `src/ui/pages/AccountsPage.tsx`

- [ ] **Step 1: Add Browse Library button and drawer**

```typescript
import AccountLibraryDrawer from '../components/AccountLibraryDrawer'
// in component:
const [showLibrary, setShowLibrary] = useState(false)
const existingNumbers = new Set(accounts.map((a) => a.number))
```

In the page header, add next to "New Account" button:
```tsx
<button
  onClick={() => setShowLibrary(true)}
  className="border border-neon text-neon hover:bg-neon hover:text-void text-xs font-semibold px-3 py-1.5 rounded-sm transition-colors"
>
  Browse Library
</button>
```

After the table:
```tsx
{showLibrary && (
  <AccountLibraryDrawer
    existingNumbers={existingNumbers}
    onClose={() => setShowLibrary(false)}
    onAdded={load}
  />
)}
```

- [ ] **Step 2: Type check + commit**

```bash
npx tsc --project src/ui/tsconfig.json --noEmit
git add src/ui/pages/AccountsPage.tsx
git commit -m "feat: add Browse Library button to Chart of Accounts"
```

---

### Task 4: Wire into OnboardingWizard Step 3

**Files:**
- Modify: `src/ui/components/OnboardingWizard.tsx`

- [ ] **Step 1: Replace module checkboxes in Step 3 with template suggestions**

In `OnboardingWizard.tsx`, Step 3 currently shows AR/AP and Inventory module checkboxes. Replace with template suggestions:

```typescript
import { getTemplatesForBusinessType, type AccountTemplate } from '../lib/accountTemplates'
import { createAccount } from '../api/client'

// Inside Step 3:
const [selectedTemplates, setSelectedTemplates] = useState<Set<string>>(new Set())
const suggestedTemplates = getTemplatesForBusinessType(businessType ?? 'other').slice(0, 12)

function toggleTemplate(number: string) {
  setSelectedTemplates((prev) => {
    const next = new Set(prev)
    next.has(number) ? next.delete(number) : next.add(number)
    return next
  })
}

async function handleAddSelected() {
  const toAdd = suggestedTemplates.filter((t) => selectedTemplates.has(t.number))
  for (const t of toAdd) {
    try {
      await createAccount({
        number: t.number, name: t.name, type: t.type,
        normalBalance: t.normalBalance, isContra: t.isContra,
        contraTo: t.contraTo, classification: t.classification,
      })
    } catch {
      // account may already exist — skip
    }
  }
}
```

Render the template list with checkboxes (nothing pre-checked):
```tsx
<div className="space-y-1 max-h-48 overflow-y-auto">
  {suggestedTemplates.map((t) => (
    <label key={t.number} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-surface cursor-pointer">
      <input type="checkbox" checked={selectedTemplates.has(t.number)} onChange={() => toggleTemplate(t.number)} className="accent-neon" />
      <span className="text-ash text-xs font-mono">{t.number}</span>
      <span className="text-chalk text-xs">{t.name}</span>
    </label>
  ))}
</div>
<button onClick={handleAddSelected} className="mt-3 text-neon hover:text-chalk text-xs transition-colors">
  Add Selected to Chart of Accounts
</button>
```

- [ ] **Step 2: Type check + commit**

```bash
npx tsc --project src/ui/tsconfig.json --noEmit
git add src/ui/components/OnboardingWizard.tsx
git commit -m "feat: add account template suggestions to onboarding wizard step 3"
```

---

### Task 5: Wire into Settings → Accounts tab

**Files:**
- Modify: `src/ui/pages/SettingsPage.tsx`

- [ ] **Step 1: Add Library sub-section to AccountsSettings**

In the existing `AccountsSettings` component in `SettingsPage.tsx`, add below the column visibility section:

```typescript
import { ACCOUNT_TEMPLATES } from '../lib/accountTemplates'
import { createAccount, listAccounts } from '../api/client'

// Inside AccountsSettings, add:
const [existingNumbers, setExistingNumbers] = useState<Set<string>>(new Set())
const [libraryAdding, setLibraryAdding] = useState<Set<string>>(new Set())
const [libraryAdded, setLibraryAdded] = useState<Set<string>>(new Set())

useEffect(() => {
  listAccounts().then((a) => setExistingNumbers(new Set(a.map((acc) => acc.number))))
}, [])

const unadded = ACCOUNT_TEMPLATES.filter((t) => !existingNumbers.has(t.number) && !libraryAdded.has(t.number))

async function handleLibraryAdd(t: (typeof ACCOUNT_TEMPLATES)[0]) {
  setLibraryAdding((p) => new Set(p).add(t.number))
  try {
    await createAccount({ number: t.number, name: t.name, type: t.type, normalBalance: t.normalBalance, isContra: t.isContra, contraTo: t.contraTo, classification: t.classification })
    setLibraryAdded((p) => new Set(p).add(t.number))
  } finally {
    setLibraryAdding((p) => { const n = new Set(p); n.delete(t.number); return n })
  }
}
```

Render below the column settings:
```tsx
<div className="mt-6">
  <h3 className="text-chalk text-sm font-medium mb-1">Account Library</h3>
  <p className="text-ash text-xs mb-3">Accounts not yet in your chart of accounts.</p>
  {unadded.length === 0 && <p className="text-ash text-xs">All library accounts have been added.</p>}
  <div className="space-y-1 max-h-64 overflow-y-auto">
    {unadded.map((t) => (
      <div key={t.number} className="flex items-center justify-between py-1.5 border-b border-rim/30">
        <div>
          <span className="text-ash text-xs font-mono mr-2">{t.number}</span>
          <span className="text-chalk text-xs">{t.name}</span>
        </div>
        <button
          onClick={() => handleLibraryAdd(t)}
          disabled={libraryAdding.has(t.number)}
          className="text-neon hover:text-chalk text-[10px] font-semibold border border-neon rounded-sm px-2 py-0.5 hover:bg-neon hover:text-void transition-colors disabled:opacity-50"
        >
          {libraryAdding.has(t.number) ? '…' : 'ADD+'}
        </button>
      </div>
    ))}
  </div>
</div>
```

- [ ] **Step 2: Type check + commit**

```bash
npx tsc --project src/ui/tsconfig.json --noEmit
git add src/ui/pages/SettingsPage.tsx
git commit -m "feat: add Account Library section to Settings → Accounts tab"
```
