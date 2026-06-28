# Plan C — Capability Layers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Features section of Settings — a card grid where users can enable, hide, and track opt-in capabilities (workflows and modules) — and wire the sidebar to show only what is enabled.

**Architecture:** A new pure library `features.ts` owns the feature registry, state (localStorage `cb_feature_state`), and an append-only lifecycle log (localStorage `cb_feature_log`). A new `FeaturesTab` renders the card grid and dispatches `cb:feature-state-changed` after every state mutation. `Layout.tsx` listens for that event and re-renders the sidebar, showing only enabled workflow nav items. `VaultTab.tsx` gains a read-only Feature History panel.

**Tech Stack:** TypeScript strict, React 19, Tailwind v4, Vitest, existing `featureFlags.ts` / `Layout.tsx` / `SettingsPage.tsx` / `VaultTab.tsx`.

**Known limitation:** The slash commands from Plan B (`/set ar-ap on`) write to `cb_flags` via `featureFlags.ts`. The new `features.ts` reads from `cb_feature_state`. These are separate stores — a user who toggled AR/AP via a slash command will see the FeaturesTab reflect only its own state. A future plan will migrate `featureFlags.ts` to delegate to `features.ts`.

---

## File Map

| File | Status | Responsibility |
|------|--------|----------------|
| `src/ui/lib/features.ts` | **Create** | Feature registry, state R/W, lifecycle log R/W |
| `src/ui/pages/settings/FeaturesTab.tsx` | **Create** | Card grid UI — 3 tiers, Add/Hide actions |
| `src/ui/pages/SettingsPage.tsx` | **Modify** | Add `'features'` to Tab type + CATEGORIES + render switch |
| `src/ui/components/Layout.tsx` | **Modify** | Gate Extra Workflows sidebar items; listen for `cb:feature-state-changed` |
| `src/ui/pages/settings/VaultTab.tsx` | **Modify** | Add collapsible Feature History section |
| `tests/ui/features.test.ts` | **Create** | Unit tests for all pure functions in `features.ts` |

---

## Task 1: Create `src/ui/lib/features.ts`

**Files:**
- Create: `src/ui/lib/features.ts`
- Create: `tests/ui/features.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/ui/features.test.ts`:

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest'

function makeLocalStorage() {
  const store: Record<string, string> = {}
  return {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => { store[k] = v },
    removeItem: (k: string) => { delete store[k] },
    clear: () => { Object.keys(store).forEach((k) => delete store[k]) },
  }
}

describe('features.ts', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', makeLocalStorage())
  })

  describe('FEATURE_REGISTRY', () => {
    it('contains core, workflow, and module tiers', async () => {
      const { FEATURE_REGISTRY } = await import('../../src/ui/lib/features')
      const tiers = new Set(FEATURE_REGISTRY.map((f) => f.tier))
      expect(tiers).toContain('core')
      expect(tiers).toContain('workflow')
      expect(tiers).toContain('module')
    })

    it('every feature has a unique id', async () => {
      const { FEATURE_REGISTRY } = await import('../../src/ui/lib/features')
      const ids = FEATURE_REGISTRY.map((f) => f.id)
      expect(new Set(ids).size).toBe(ids.length)
    })

    it('workflow features with a navPath also have a navLabel', async () => {
      const { FEATURE_REGISTRY } = await import('../../src/ui/lib/features')
      FEATURE_REGISTRY
        .filter((f) => f.tier === 'workflow' && f.navPath !== undefined)
        .forEach((f) => {
          expect(f.navLabel).toBeTruthy()
        })
    })
  })

  describe('isFeatureActive', () => {
    it('always returns true for core features', async () => {
      const { FEATURE_REGISTRY, isFeatureActive } = await import('../../src/ui/lib/features')
      const coreFeatures = FEATURE_REGISTRY.filter((f) => f.tier === 'core')
      expect(coreFeatures.length).toBeGreaterThan(0)
      coreFeatures.forEach((f) => {
        expect(isFeatureActive(f.id)).toBe(true)
      })
    })

    it('returns false for an unknown feature id', async () => {
      const { isFeatureActive } = await import('../../src/ui/lib/features')
      expect(isFeatureActive('nonexistent')).toBe(false)
    })

    it('returns true for workflow features in ENABLED_BY_DEFAULT when no state stored', async () => {
      const { isFeatureActive } = await import('../../src/ui/lib/features')
      expect(isFeatureActive('bank-feed')).toBe(true)
      expect(isFeatureActive('reconciliation')).toBe(true)
      expect(isFeatureActive('recurring')).toBe(true)
      expect(isFeatureActive('close-period')).toBe(true)
    })

    it('returns false for module features with no state stored', async () => {
      const { isFeatureActive } = await import('../../src/ui/lib/features')
      expect(isFeatureActive('ar_ap')).toBe(false)
      expect(isFeatureActive('inventory')).toBe(false)
    })

    it('returns true for an explicitly enabled feature', async () => {
      const { enableFeature, isFeatureActive } = await import('../../src/ui/lib/features')
      enableFeature('ar_ap')
      expect(isFeatureActive('ar_ap')).toBe(true)
    })

    it('returns false for an explicitly hidden feature that was default-enabled', async () => {
      const { hideFeature, isFeatureActive } = await import('../../src/ui/lib/features')
      hideFeature('bank-feed')
      expect(isFeatureActive('bank-feed')).toBe(false)
    })
  })

  describe('enableFeature / hideFeature', () => {
    it('enableFeature persists enabled status', async () => {
      const { enableFeature, getFeatureStatuses } = await import('../../src/ui/lib/features')
      enableFeature('ar_ap')
      expect(getFeatureStatuses()['ar_ap']).toBe('enabled')
    })

    it('hideFeature persists hidden status', async () => {
      const { hideFeature, getFeatureStatuses } = await import('../../src/ui/lib/features')
      hideFeature('bank-feed')
      expect(getFeatureStatuses()['bank-feed']).toBe('hidden')
    })

    it('enabling a previously hidden feature appends a re-enabled event', async () => {
      const { enableFeature, hideFeature, getLifecycleLog } = await import('../../src/ui/lib/features')
      hideFeature('bank-feed')
      enableFeature('bank-feed')
      const log = getLifecycleLog()
      expect(log[log.length - 1].event).toBe('re-enabled')
    })

    it('enabling a new feature appends an enabled event', async () => {
      const { enableFeature, getLifecycleLog } = await import('../../src/ui/lib/features')
      enableFeature('ar_ap')
      const log = getLifecycleLog()
      expect(log[log.length - 1].event).toBe('enabled')
      expect(log[log.length - 1].featureId).toBe('ar_ap')
    })

    it('hideFeature appends a hidden event', async () => {
      const { hideFeature, getLifecycleLog } = await import('../../src/ui/lib/features')
      hideFeature('bank-feed')
      const log = getLifecycleLog()
      expect(log[log.length - 1].event).toBe('hidden')
      expect(log[log.length - 1].featureId).toBe('bank-feed')
    })
  })

  describe('getLifecycleLog', () => {
    it('returns empty array when no log exists', async () => {
      const { getLifecycleLog } = await import('../../src/ui/lib/features')
      expect(getLifecycleLog()).toEqual([])
    })

    it('accumulates events in chronological order', async () => {
      const { enableFeature, hideFeature, enableFeature: enable2, getLifecycleLog } = await import('../../src/ui/lib/features')
      enableFeature('ar_ap')
      hideFeature('ar_ap')
      enable2('ar_ap')
      const log = getLifecycleLog()
      expect(log).toHaveLength(3)
      expect(log.map((e) => e.event)).toEqual(['enabled', 'hidden', 're-enabled'])
    })

    it('each event has featureId, featureName, event, and timestamp fields', async () => {
      const { enableFeature, getLifecycleLog } = await import('../../src/ui/lib/features')
      enableFeature('ar_ap')
      const [entry] = getLifecycleLog()
      expect(entry.featureId).toBe('ar_ap')
      expect(typeof entry.featureName).toBe('string')
      expect(entry.event).toBe('enabled')
      expect(new Date(entry.timestamp).getFullYear()).toBeGreaterThan(2020)
    })
  })
})
```

- [ ] **Step 2: Run the test — expect FAIL**

```bash
npx vitest run tests/ui/features.test.ts
```

Expected: FAIL — module `../../src/ui/lib/features` not found.

- [ ] **Step 3: Create `src/ui/lib/features.ts`**

```typescript
export type FeatureTier = 'core' | 'workflow' | 'module'
export type FeatureStatus = 'enabled' | 'hidden'
export type LifecycleEventType = 'enabled' | 'hidden' | 're-enabled'

export interface FeatureDef {
  id: string
  tier: FeatureTier
  name: string
  description: string
  navPath?: string
  navLabel?: string
}

export interface LifecycleEvent {
  featureId: string
  featureName: string
  event: LifecycleEventType
  timestamp: string
}

export const FEATURE_REGISTRY: FeatureDef[] = [
  // Core — always on, cannot be hidden
  {
    id: 'chart-of-accounts',
    tier: 'core',
    name: 'Chart of Accounts',
    description: 'Track every asset, liability, equity, revenue, and expense account.',
  },
  {
    id: 'journal-entries',
    tier: 'core',
    name: 'Journal Entries & Drafts',
    description: 'Record double-entry bookkeeping transactions with full draft workflow.',
  },
  // Workflows — opt-in, default enabled (they were always visible before Plan C)
  {
    id: 'recurring',
    tier: 'workflow',
    name: 'Recurring Entries',
    description: 'Automate repeating journal entries on a defined schedule.',
    navPath: '/extra/recurring',
    navLabel: 'Recurring',
  },
  {
    id: 'close-period',
    tier: 'workflow',
    name: 'Period Close',
    description: 'Lock accounting periods to prevent changes to finalized books.',
    navPath: '/extra/close-period',
    navLabel: 'Close Period',
  },
  {
    id: 'bank-feed',
    tier: 'workflow',
    name: 'Bank Feed & Import',
    description: 'Import bank CSV rows and map them to draft journal entries.',
    navPath: '/extra/bank-feed',
    navLabel: 'Bank Feed',
  },
  {
    id: 'reconciliation',
    tier: 'workflow',
    name: 'Reconciliation',
    description: 'Clear entries against bank statements to verify accuracy.',
    navPath: '/extra/reconciliation',
    navLabel: 'Reconciliation',
  },
  {
    id: 'bank-rules',
    tier: 'workflow',
    name: 'Bank Rules',
    description: 'Create auto-categorization rules for recurring import patterns.',
  },
  // Modules — opt-in, default hidden
  {
    id: 'ar_ap',
    tier: 'module',
    name: 'AR / AP',
    description: 'Track invoices, bills, and aging for customers and vendors.',
  },
  {
    id: 'inventory',
    tier: 'module',
    name: 'Inventory',
    description: 'Track SKUs, unit costs, and quantities on hand.',
  },
]

// Workflow features that were always visible before Plan C — default them enabled
// so existing users see no change on first load.
const ENABLED_BY_DEFAULT = new Set(['recurring', 'close-period', 'bank-feed', 'reconciliation'])

const STATE_KEY = 'cb_feature_state'
const LOG_KEY = 'cb_feature_log'

export function getFeatureStatuses(): Record<string, FeatureStatus> {
  const raw = localStorage.getItem(STATE_KEY)
  if (!raw) return {}
  try {
    return JSON.parse(raw) as Record<string, FeatureStatus>
  } catch {
    return {}
  }
}

function saveFeatureStatuses(statuses: Record<string, FeatureStatus>): void {
  localStorage.setItem(STATE_KEY, JSON.stringify(statuses))
}

export function isFeatureActive(id: string): boolean {
  const def = FEATURE_REGISTRY.find((f) => f.id === id)
  if (!def) return false
  if (def.tier === 'core') return true
  const statuses = getFeatureStatuses()
  if (id in statuses) return statuses[id] === 'enabled'
  return ENABLED_BY_DEFAULT.has(id)
}

export function enableFeature(id: string): void {
  const statuses = getFeatureStatuses()
  const wasHidden = statuses[id] === 'hidden'
  statuses[id] = 'enabled'
  saveFeatureStatuses(statuses)
  appendLifecycleEvent(id, wasHidden ? 're-enabled' : 'enabled')
}

export function hideFeature(id: string): void {
  const statuses = getFeatureStatuses()
  statuses[id] = 'hidden'
  saveFeatureStatuses(statuses)
  appendLifecycleEvent(id, 'hidden')
}

export function getLifecycleLog(): LifecycleEvent[] {
  const raw = localStorage.getItem(LOG_KEY)
  if (!raw) return []
  try {
    return JSON.parse(raw) as LifecycleEvent[]
  } catch {
    return []
  }
}

function appendLifecycleEvent(featureId: string, event: LifecycleEventType): void {
  const def = FEATURE_REGISTRY.find((f) => f.id === featureId)
  if (!def) return
  const log = getLifecycleLog()
  log.push({ featureId, featureName: def.name, event, timestamp: new Date().toISOString() })
  localStorage.setItem(LOG_KEY, JSON.stringify(log))
}
```

- [ ] **Step 4: Run the test — expect PASS**

```bash
npx vitest run tests/ui/features.test.ts
```

Expected: all tests passing (approximately 16 tests).

- [ ] **Step 5: Run full suite to check for regressions**

```bash
npx vitest run
```

Expected: all tests passing.

- [ ] **Step 6: TypeScript check**

```bash
npx tsc --project src/ui/tsconfig.json --noEmit
```

Expected: 0 errors.

- [ ] **Step 7: Commit**

```bash
git add src/ui/lib/features.ts tests/ui/features.test.ts
git commit -m "feat: add feature registry, state management, and lifecycle log"
```

---

## Task 2: Create `FeaturesTab.tsx` and wire into `SettingsPage.tsx`

**Files:**
- Create: `src/ui/pages/settings/FeaturesTab.tsx`
- Modify: `src/ui/pages/SettingsPage.tsx`

- [ ] **Step 1: Create `src/ui/pages/settings/FeaturesTab.tsx`**

```typescript
import { useState, useEffect } from 'react'
import {
  FEATURE_REGISTRY,
  isFeatureActive,
  enableFeature,
  hideFeature,
  type FeatureDef,
  type FeatureTier,
} from '../../lib/features'

const EVENT_LABEL: Record<string, string> = {
  enabled: 'Enabled',
  hidden: 'Hidden',
  're-enabled': 'Re-enabled',
}

interface CardProps {
  def: FeatureDef
  onAction: () => void
}

function FeatureCard({ def, onAction }: CardProps) {
  const active = isFeatureActive(def.id)
  const isCore = def.tier === 'core'

  function handleEnable() {
    enableFeature(def.id)
    window.dispatchEvent(new CustomEvent('cb:feature-state-changed'))
    onAction()
  }

  function handleHide() {
    hideFeature(def.id)
    window.dispatchEvent(new CustomEvent('cb:feature-state-changed'))
    onAction()
  }

  return (
    <div className={`bg-surface border border-rim rounded-sm p-4 flex flex-col gap-3 ${isCore ? 'opacity-60' : ''}`}>
      <div>
        <p className="text-sm font-semibold text-chalk">{def.name}</p>
        <p className="text-xs text-ash mt-1 leading-relaxed">{def.description}</p>
      </div>
      <div className="flex items-center gap-2 mt-auto">
        {isCore && (
          <span className="text-[10px] text-ash border border-rim rounded px-2 py-0.5 uppercase tracking-wider">
            Always on
          </span>
        )}
        {!isCore && active && (
          <>
            <span className="text-[10px] text-green-400 border border-green-800 rounded px-2 py-0.5 uppercase tracking-wider">
              Enabled
            </span>
            <button
              onClick={handleHide}
              className="text-xs text-ash hover:text-chalk border border-rim rounded px-2 py-0.5 transition-colors cursor-pointer"
            >
              Hide
            </button>
          </>
        )}
        {!isCore && !active && (
          <button
            onClick={handleEnable}
            className="text-xs text-neon border border-neon/40 hover:bg-neon/10 rounded px-2 py-0.5 transition-colors cursor-pointer"
          >
            Add
          </button>
        )}
      </div>
    </div>
  )
}

const TIERS: { tier: FeatureTier; label: string; sublabel: string }[] = [
  { tier: 'core', label: 'Core', sublabel: 'Always on. Cannot be hidden.' },
  { tier: 'workflow', label: 'Workflows', sublabel: 'Optional features for common accounting workflows.' },
  { tier: 'module', label: 'Modules', sublabel: 'Optional modules that extend the ledger.' },
]

export default function FeaturesTab() {
  const [, setVersion] = useState(0)

  useEffect(() => {
    function handler() { setVersion((v) => v + 1) }
    window.addEventListener('cb:feature-state-changed', handler)
    return () => window.removeEventListener('cb:feature-state-changed', handler)
  }, [])

  function forceRefresh() { setVersion((v) => v + 1) }

  return (
    <div className="space-y-8">
      {TIERS.map(({ tier, label, sublabel }) => {
        const features = FEATURE_REGISTRY.filter((f) => f.tier === tier)
        return (
          <div key={tier}>
            <div className="mb-4">
              <h3 className="text-sm font-semibold text-chalk">{label}</h3>
              <p className="text-xs text-ash mt-0.5">{sublabel}</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {features.map((def) => (
                <FeatureCard key={def.id} def={def} onAction={forceRefresh} />
              ))}
            </div>
          </div>
        )
      })}

      <div className="bg-surface border border-rim rounded-sm px-4 py-3">
        <p className="text-xs text-ash leading-relaxed">
          <strong className="text-chalk">Hiding a feature</strong> removes it from the sidebar. All data is preserved
          and can be restored by clicking <strong className="text-chalk">Add</strong> again.
        </p>
      </div>
    </div>
  )
}
```

Note on `const [, setVersion]`: the state value is intentionally unused; only the setter matters (it triggers a re-render). TypeScript strict mode does not flag unused destructuring second elements.

- [ ] **Step 2: Wire `FeaturesTab` into `SettingsPage.tsx`**

Make the following three changes to `src/ui/pages/SettingsPage.tsx`:

**Change A** — Add the import at the top (after the existing imports):
```typescript
import FeaturesTab from './settings/FeaturesTab'
```

**Change B** — Add `'features'` to the `Tab` union type. Find:
```typescript
type Tab =
  | 'vault' | 'general' | 'navigation' | 'accounts' | 'payment-methods'
  | 'accounting' | 'bank-rules' | 'shortcuts' | 'ai' | 'plugins'
  | 'audit' | 'users' | 'database' | 'reports'
```
Replace with:
```typescript
type Tab =
  | 'vault' | 'general' | 'navigation' | 'accounts' | 'payment-methods'
  | 'accounting' | 'bank-rules' | 'shortcuts' | 'features' | 'ai' | 'plugins'
  | 'audit' | 'users' | 'database' | 'reports'
```

**Change C** — Add the Features category to `CATEGORIES` between `'shortcuts'` and `'ai'`. Find:
```typescript
  { id: 'shortcuts', label: 'Shortcuts' },
  { id: 'ai', label: 'AI' },
```
Replace with:
```typescript
  { id: 'shortcuts', label: 'Shortcuts' },
  { id: 'features', label: 'Features' },
  { id: 'ai', label: 'AI' },
```

**Change D** — Add the render case in the right panel. Find:
```typescript
        {tab === 'shortcuts' && <ShortcutsTab />}
        {tab === 'ai' && <AITab />}
```
Replace with:
```typescript
        {tab === 'shortcuts' && <ShortcutsTab />}
        {tab === 'features' && <FeaturesTab />}
        {tab === 'ai' && <AITab />}
```

- [ ] **Step 3: TypeScript check**

```bash
npx tsc --project src/ui/tsconfig.json --noEmit
```

Expected: 0 errors.

- [ ] **Step 4: Run full test suite**

```bash
npx vitest run
```

Expected: all tests passing.

- [ ] **Step 5: Commit**

```bash
git add src/ui/pages/settings/FeaturesTab.tsx src/ui/pages/SettingsPage.tsx
git commit -m "feat: add Features settings tab with capability card grid"
```

---

## Task 3: Gate Extra Workflows sidebar items in `Layout.tsx`

**Files:**
- Modify: `src/ui/components/Layout.tsx`

When a workflow feature is hidden, its nav link should disappear from the sidebar. If no workflows are enabled, the Extra Workflows section disappears entirely — including its icon in collapsed mode.

- [ ] **Step 1: Add the import**

At the top of `src/ui/components/Layout.tsx`, find the existing imports from `../lib/` and add one more import:

```typescript
import { isFeatureActive } from '../lib/features'
```

Place it near the other lib imports (e.g., after the `import { getOllamaConfig ...` line).

- [ ] **Step 2: Add `featureVersion` state and event listener**

Inside the `Layout` component function, find the existing `sidebarWide` state declaration:

```typescript
  const [sidebarWide, setSidebarWideState] = useState(getSidebarWide)
```

Add `featureVersion` immediately after it:

```typescript
  const [featureVersion, setFeatureVersion] = useState(0)
```

Then find the existing `cb:sidebar-wide-changed` useEffect block:

```typescript
  useEffect(() => {
    function handleSidebarWidthChange(e: Event) {
      setSidebarWideState((e as CustomEvent<{ wide: boolean }>).detail.wide)
    }
    window.addEventListener('cb:sidebar-wide-changed', handleSidebarWidthChange)
    return () => window.removeEventListener('cb:sidebar-wide-changed', handleSidebarWidthChange)
  }, [])
```

Add a new `useEffect` immediately after it:

```typescript
  useEffect(() => {
    function handleFeatureChange() { setFeatureVersion((v) => v + 1) }
    window.addEventListener('cb:feature-state-changed', handleFeatureChange)
    return () => window.removeEventListener('cb:feature-state-changed', handleFeatureChange)
  }, [])
```

- [ ] **Step 3: Replace the `extra-workflows` section content with a gated version**

In the `sectionContent` IIFE inside the wide-mode nav, find the `extra-workflows` entry:

```typescript
                  'extra-workflows': (
                    <SidebarSection id="extra-workflows" label="Extra Workflows">
                      <NavLink to="/extra/bank-feed" className={navLinkClass}>Bank Feed</NavLink>
                      <NavLink to="/extra/reconciliation" className={navLinkClass}>Reconciliation</NavLink>
                      <NavLink to="/extra/recurring" className={navLinkClass}>Recurring</NavLink>
                      <NavLink to="/extra/close-period" className={navLinkClass}>Close Period</NavLink>
                    </SidebarSection>
                  ),
```

Replace with:

```typescript
                  'extra-workflows': (() => {
                    const workflowLinks = [
                      { id: 'bank-feed',      to: '/extra/bank-feed',      label: 'Bank Feed' },
                      { id: 'reconciliation', to: '/extra/reconciliation', label: 'Reconciliation' },
                      { id: 'recurring',      to: '/extra/recurring',      label: 'Recurring' },
                      { id: 'close-period',   to: '/extra/close-period',   label: 'Close Period' },
                    ].filter((w) => isFeatureActive(w.id))
                    if (workflowLinks.length === 0) return null
                    return (
                      <SidebarSection id="extra-workflows" label="Extra Workflows">
                        {workflowLinks.map((w) => (
                          <NavLink key={w.id} to={w.to} className={navLinkClass}>{w.label}</NavLink>
                        ))}
                      </SidebarSection>
                    )
                  })(),
```

Note: the inner IIFE pattern matches the outer IIFE that already wraps `sectionContent`. TypeScript handles `null` returns from section values gracefully since the `navOrder.map` renders them into the DOM — but we need to ensure the section render handles `null`. Look at how `navOrder.map` iterates `sectionContent` and renders `{sectionContent[sectionId]}`. If the value is `null`, React renders nothing. This is correct.

- [ ] **Step 4: Gate the Extra Workflows icon in the collapsed icon rail**

In the collapsed-mode icon rail (the `!sidebarWide` branch), find the existing Extra Workflows icon button:

```typescript
              <button
                title="Extra Workflows"
                onClick={() => { expandSection('extra-workflows'); toggleSidebar() }}
                className="flex items-center justify-center w-8 h-8 rounded text-ash hover:text-chalk hover:bg-surface transition-colors"
              >
                <svg aria-hidden="true" ...>...</svg>
              </button>
```

Wrap it in a conditional so it only renders when at least one workflow is active. Add this computed value before the return statement (or compute it inline). The simplest approach is an inline conditional:

Find the button and replace it with:

```typescript
              {['bank-feed', 'reconciliation', 'recurring', 'close-period'].some((id) => isFeatureActive(id)) && (
                <button
                  title="Extra Workflows"
                  onClick={() => { expandSection('extra-workflows'); toggleSidebar() }}
                  className="flex items-center justify-center w-8 h-8 rounded text-ash hover:text-chalk hover:bg-surface transition-colors"
                >
                  <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
                  </svg>
                </button>
              )}
```

The SVG content is unchanged from the current code — copy it exactly.

- [ ] **Step 5: Add `featureVersion` to the dependency comment**

`featureVersion` is incremented to trigger re-renders. TypeScript strict mode may warn about declared-but-not-read state values. To silence this without a no-op, ensure the variable appears in the JSX render path at least once as a `key` or similar. The simplest approach: add `key={featureVersion}` on a stable outer element is heavy-handed. Instead, just note that React state setters are always stable and TypeScript does not flag destructured state values as unused. No additional action needed.

- [ ] **Step 6: TypeScript check**

```bash
npx tsc --project src/ui/tsconfig.json --noEmit
```

Expected: 0 errors. If TypeScript flags `featureVersion` as declared-but-not-read, add a void cast after the useState line:

```typescript
  const [featureVersion, setFeatureVersion] = useState(0)
  void featureVersion
```

- [ ] **Step 7: Run full test suite**

```bash
npx vitest run
```

Expected: all tests passing.

- [ ] **Step 8: Commit**

```bash
git add src/ui/components/Layout.tsx
git commit -m "feat: gate sidebar workflow items behind feature state"
```

---

## Task 4: Add Feature History panel to `VaultTab.tsx`

**Files:**
- Modify: `src/ui/pages/settings/VaultTab.tsx`

Add a collapsible "Feature history" section at the bottom of VaultTab that reads the lifecycle log and displays it in reverse-chronological order (most recent first). The log is read-only — no actions, no filtering.

Note: VaultTab.tsx has pre-existing uncommitted changes on disk. Read the file before editing and preserve all existing functionality.

- [ ] **Step 1: Add the import**

At the top of `src/ui/pages/settings/VaultTab.tsx`, add:

```typescript
import { getLifecycleLog, type LifecycleEvent } from '../../lib/features'
```

Place it after the existing `import { useState, useEffect } from 'react'` line.

- [ ] **Step 2: Add `historyOpen` state inside `VaultTab`**

Inside the `VaultTab` function body (after the existing state declarations), add:

```typescript
  const [historyOpen, setHistoryOpen] = useState(false)
  const [log, setLog] = useState<LifecycleEvent[]>([])
```

- [ ] **Step 3: Load log when section is opened**

Add a `useEffect` that loads the log when `historyOpen` becomes true. Place it alongside the other `useEffect` calls in the component:

```typescript
  useEffect(() => {
    if (historyOpen) setLog(getLifecycleLog())
  }, [historyOpen])
```

- [ ] **Step 4: Add the Feature History section to the JSX**

In the `VaultTab` component's return JSX (inside the `<div className="space-y-6">` wrapper), find the closing `</div>` of the "Vault contents" section and add the Feature History section immediately after it, before the component's final `</div>`:

```typescript
      {/* Feature history */}
      <div>
        <button
          onClick={() => setHistoryOpen((v) => !v)}
          className="flex items-center gap-2 text-sm font-semibold text-chalk hover:text-neon transition-colors cursor-pointer"
        >
          <span>{historyOpen ? '▾' : '▸'}</span>
          Feature history
        </button>
        {historyOpen && (
          <div className="mt-3 bg-surface border border-rim rounded-lg divide-y divide-rim">
            {log.length === 0 ? (
              <p className="px-5 py-4 text-sm text-ash">No feature changes recorded yet.</p>
            ) : (
              [...log].reverse().map((entry, i) => (
                <div key={i} className="flex items-center justify-between px-5 py-3">
                  <div>
                    <span className="text-sm text-chalk">{entry.featureName}</span>
                    <span className="text-xs text-ash ml-2">
                      {entry.event === 'enabled' ? 'Enabled'
                        : entry.event === 'hidden' ? 'Hidden'
                        : 'Re-enabled'}
                    </span>
                  </div>
                  <span className="text-xs text-ash font-mono">
                    {new Date(entry.timestamp).toLocaleDateString('en-US', {
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric',
                    })}
                  </span>
                </div>
              ))
            )}
          </div>
        )}
      </div>
```

Note: VaultTab renders either a "desktop-only" message (when `!vault || !state`) or the full management UI. The Feature History section goes in the full management UI path, inside `<div className="space-y-6">`. In the "desktop-only" message path, feature history is omitted — that is intentional, since in web mode there are no feature state changes to log against a vault.

- [ ] **Step 5: TypeScript check**

```bash
npx tsc --project src/ui/tsconfig.json --noEmit
```

Expected: 0 errors.

- [ ] **Step 6: Run full test suite**

```bash
npx vitest run
```

Expected: all tests passing.

- [ ] **Step 7: Commit**

```bash
git add src/ui/pages/settings/VaultTab.tsx
git commit -m "feat: add Feature History panel to Vault settings"
```

---

## Spec Self-Review

**1. Spec coverage check (against Section 3 of `docs/superpowers/specs/2026-06-25-sandbox-ux-design.md`)**

| Requirement | Task |
|---|---|
| Features section in Settings — card grid, 2 columns | Task 2 |
| Three tiers: Core (grayed), Workflows, Modules | Tasks 1 + 2 |
| Add / Enabled+Hide states per card | Task 2 |
| Description shown on card | Task 2 |
| Enabling adds feature to sidebar | Task 3 |
| Section disappears when all items hidden | Task 3 |
| Feature lifecycle log (append-only) | Task 1 |
| Log visible in Settings → Vault → Feature History | Task 4 |
| Log is read-only | Task 4 (no edit controls rendered) |

**Out of scope for Plan C (future plans):**
- Delete data flow (high-friction typed confirmation + actual API deletion)
- Writing log to `<vault>/.corebooks/feature-log.json` (requires Electron IPC — using localStorage as stand-in)
- Modules section in sidebar (AR/AP and Inventory have no pages yet)
- Migrating `featureFlags.ts` slash commands to use `features.ts`

**2. Placeholder scan** — no TBDs. All code is complete.

**3. Type consistency**
- `FeatureDef`, `FeatureStatus`, `LifecycleEventType`, `LifecycleEvent` defined in Task 1, consumed identically in Tasks 2 and 4.
- `isFeatureActive` returns `boolean` in Task 1, called as boolean in Task 3.
- `enableFeature` / `hideFeature` dispatch event in the component (Task 2), not in the lib — keeping `features.ts` side-effect-free.
- `featureVersion` state in Layout.tsx is a render counter; TypeScript does not flag unused destructuring targets in `useState` when using `[, setter]` pattern — but the plan uses `[featureVersion, setFeatureVersion]` for clarity and provides the `void featureVersion` fallback if needed.
