# Plan B — Command Palette Slash Commands Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a slash-command system to the CommandPalette so users can type `/go accounts`, `/new entry`, `/set ar-ap on`, etc. to navigate, open modals, and toggle feature flags without touching the mouse.

**Architecture:** A pure data registry (`slashCommands.ts`) holds every command as a discriminated union. The `CommandPalette` detects when the query starts with `/` and switches from async search results to instant local command matching. Layout.tsx gets one new event listener (`cb:open-new-entry`) so `/new entry` can open the New Entry modal from inside the palette.

**Tech Stack:** TypeScript strict, React 19, Vitest for unit tests, existing `featureFlags.ts` / `shortcuts.ts` / `useSearch.ts` / `Layout.tsx` patterns.

---

## File Map

| File | Status | Responsibility |
|------|--------|----------------|
| `src/ui/lib/slashCommands.ts` | **Create** | Command registry, discriminated action union, `matchSlashCommands` |
| `src/ui/lib/featureFlags.ts` | **Modify** | Add `setFeatureEnabled` helper |
| `src/ui/components/CommandPalette.tsx` | **Modify** | Slash-mode branch: detect `/`, render command list, execute actions |
| `src/ui/components/Layout.tsx` | **Modify** | Add `cb:open-new-entry` listener |
| `tests/ui/slashCommands.test.ts` | **Create** | Unit tests for `matchSlashCommands` |
| `tests/ui/featureFlags.setFlag.test.ts` | **Create** | Unit tests for `setFeatureEnabled` |

---

## Task 1: Add `setFeatureEnabled` to `featureFlags.ts`

**Files:**
- Modify: `src/ui/lib/featureFlags.ts`
- Create: `tests/ui/featureFlags.setFlag.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/ui/featureFlags.setFlag.test.ts`:

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest'

describe('setFeatureEnabled', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', (() => {
      const store: Record<string, string> = {}
      return {
        getItem: (k: string) => store[k] ?? null,
        setItem: (k: string, v: string) => { store[k] = v },
        removeItem: (k: string) => { delete store[k] },
        clear: () => { Object.keys(store).forEach((k) => delete store[k]) },
      }
    })())
  })

  it('enables a flag that was off by default', async () => {
    const { setFeatureEnabled, isFeatureEnabled } = await import('../../src/ui/lib/featureFlags')
    setFeatureEnabled('ar_ap', true)
    expect(isFeatureEnabled('ar_ap')).toBe(true)
  })

  it('disables a flag', async () => {
    const { setFeatureEnabled, isFeatureEnabled } = await import('../../src/ui/lib/featureFlags')
    setFeatureEnabled('ar_ap', true)
    setFeatureEnabled('ar_ap', false)
    expect(isFeatureEnabled('ar_ap')).toBe(false)
  })

  it('does not affect sibling flags', async () => {
    const { setFeatureEnabled, isFeatureEnabled } = await import('../../src/ui/lib/featureFlags')
    setFeatureEnabled('ar_ap', true)
    expect(isFeatureEnabled('inventory')).toBe(false)
  })

  it('round-trips both flags independently', async () => {
    const { setFeatureEnabled, isFeatureEnabled } = await import('../../src/ui/lib/featureFlags')
    setFeatureEnabled('ar_ap', true)
    setFeatureEnabled('inventory', true)
    setFeatureEnabled('ar_ap', false)
    expect(isFeatureEnabled('ar_ap')).toBe(false)
    expect(isFeatureEnabled('inventory')).toBe(true)
  })
})
```

- [ ] **Step 2: Run the test — expect FAIL**

```bash
npx vitest run tests/ui/featureFlags.setFlag.test.ts
```

Expected: FAIL with `setFeatureEnabled is not a function` (or similar import error).

- [ ] **Step 3: Add `setFeatureEnabled` to `featureFlags.ts`**

Open `src/ui/lib/featureFlags.ts`. After the existing `isFeatureEnabled` function, add:

```typescript
export function setFeatureEnabled(key: keyof FeatureFlags, value: boolean): void {
  saveFeatureFlags({ ...getFeatureFlags(), [key]: value })
}
```

The full file after the edit (for reference — only the new function is added, nothing else changes):

```typescript
export function setFeatureEnabled(key: keyof FeatureFlags, value: boolean): void {
  saveFeatureFlags({ ...getFeatureFlags(), [key]: value })
}
```

Place it immediately after `isFeatureEnabled` and before `getBusinessType`.

- [ ] **Step 4: Run the test — expect PASS**

```bash
npx vitest run tests/ui/featureFlags.setFlag.test.ts
```

Expected: 4 tests passing.

- [ ] **Step 5: Run full suite to check for regressions**

```bash
npx vitest run
```

Expected: all tests passing (132+ tests, 0 failures).

- [ ] **Step 6: Commit**

```bash
git add src/ui/lib/featureFlags.ts tests/ui/featureFlags.setFlag.test.ts
git commit -m "feat: add setFeatureEnabled helper to featureFlags"
```

---

## Task 2: Create `slashCommands.ts` — registry and `matchSlashCommands`

**Files:**
- Create: `src/ui/lib/slashCommands.ts`
- Create: `tests/ui/slashCommands.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/ui/slashCommands.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { matchSlashCommands, SLASH_COMMANDS } from '../../src/ui/lib/slashCommands'

describe('matchSlashCommands', () => {
  it('returns empty array for a non-slash query', () => {
    expect(matchSlashCommands('go home')).toEqual([])
    expect(matchSlashCommands('')).toEqual([])
    expect(matchSlashCommands('accounts')).toEqual([])
  })

  it('returns all commands when query is just "/"', () => {
    const results = matchSlashCommands('/')
    expect(results.length).toBe(SLASH_COMMANDS.length)
  })

  it('filters to /go namespace when query is "/go"', () => {
    const results = matchSlashCommands('/go')
    expect(results.length).toBeGreaterThan(0)
    results.forEach((cmd) => expect(cmd.trigger).toMatch(/^\/go /))
  })

  it('returns only the home command for "/go home"', () => {
    const results = matchSlashCommands('/go home')
    expect(results).toHaveLength(1)
    expect(results[0].id).toBe('go-home')
  })

  it('returns the new-entry command for "/new entry"', () => {
    const results = matchSlashCommands('/new entry')
    expect(results).toHaveLength(1)
    expect(results[0].id).toBe('new-entry')
    expect(results[0].action.type).toBe('event')
  })

  it('returns both ar-ap commands for "/set ar-ap"', () => {
    const results = matchSlashCommands('/set ar-ap')
    expect(results).toHaveLength(2)
    const ids = results.map((r) => r.id)
    expect(ids).toContain('set-ar-ap-on')
    expect(ids).toContain('set-ar-ap-off')
  })

  it('returns only the on-command for "/set ar-ap on"', () => {
    const results = matchSlashCommands('/set ar-ap on')
    expect(results).toHaveLength(1)
    expect(results[0].id).toBe('set-ar-ap-on')
    if (results[0].action.type === 'setFlag') {
      expect(results[0].action.key).toBe('ar_ap')
      expect(results[0].action.value).toBe(true)
    }
  })

  it('returns empty array for an unknown command', () => {
    expect(matchSlashCommands('/xyz')).toEqual([])
    expect(matchSlashCommands('/go nowhere')).toEqual([])
  })

  it('is case-insensitive', () => {
    const lower = matchSlashCommands('/go home')
    const upper = matchSlashCommands('/GO HOME')
    expect(upper.map((c) => c.id)).toEqual(lower.map((c) => c.id))
  })

  it('every command has a unique id', () => {
    const ids = SLASH_COMMANDS.map((c) => c.id)
    const unique = new Set(ids)
    expect(unique.size).toBe(ids.length)
  })

  it('every navigate action has a non-empty path', () => {
    SLASH_COMMANDS
      .filter((c) => c.action.type === 'navigate')
      .forEach((c) => {
        if (c.action.type === 'navigate') {
          expect(c.action.path.startsWith('/')).toBe(true)
        }
      })
  })
})
```

- [ ] **Step 2: Run the test — expect FAIL**

```bash
npx vitest run tests/ui/slashCommands.test.ts
```

Expected: FAIL — module `../../src/ui/lib/slashCommands` not found.

- [ ] **Step 3: Create `src/ui/lib/slashCommands.ts`**

```typescript
import type { FeatureFlags } from './featureFlags'

export type SlashCommandAction =
  | { type: 'navigate'; path: string }
  | { type: 'event'; name: string }
  | { type: 'setFlag'; key: keyof FeatureFlags; value: boolean }

export interface SlashCommand {
  id: string
  trigger: string
  label: string
  sublabel: string
  action: SlashCommandAction
}

export const SLASH_COMMANDS: SlashCommand[] = [
  // /go — navigation
  { id: 'go-home',               trigger: '/go home',                label: '/go home',                sublabel: 'Navigate to Home',                   action: { type: 'navigate', path: '/home' } },
  { id: 'go-accounts',           trigger: '/go accounts',            label: '/go accounts',            sublabel: 'Navigate to Chart of Accounts',       action: { type: 'navigate', path: '/accounts' } },
  { id: 'go-entries',            trigger: '/go entries',             label: '/go entries',             sublabel: 'Navigate to Entries',                 action: { type: 'navigate', path: '/entries' } },
  { id: 'go-drafts',             trigger: '/go drafts',              label: '/go drafts',              sublabel: 'Navigate to Drafts',                  action: { type: 'navigate', path: '/drafts' } },
  { id: 'go-reports',            trigger: '/go reports',             label: '/go reports',             sublabel: 'Navigate to Reports Library',          action: { type: 'navigate', path: '/reports' } },
  { id: 'go-recurring',          trigger: '/go recurring',           label: '/go recurring',           sublabel: 'Navigate to Recurring Entries',        action: { type: 'navigate', path: '/extra/recurring' } },
  { id: 'go-close-period',       trigger: '/go close-period',        label: '/go close-period',        sublabel: 'Navigate to Close Period',             action: { type: 'navigate', path: '/extra/close-period' } },
  { id: 'go-bank-feed',          trigger: '/go bank-feed',           label: '/go bank-feed',           sublabel: 'Navigate to Bank Feed Import',         action: { type: 'navigate', path: '/extra/bank-feed' } },
  { id: 'go-reconciliation',     trigger: '/go reconciliation',      label: '/go reconciliation',      sublabel: 'Navigate to Reconciliation',           action: { type: 'navigate', path: '/extra/reconciliation' } },
  { id: 'go-settings',           trigger: '/go settings',            label: '/go settings',            sublabel: 'Navigate to Settings',                action: { type: 'navigate', path: '/settings' } },
  { id: 'go-settings-vault',     trigger: '/go settings/vault',      label: '/go settings/vault',      sublabel: 'Open Vault settings tab',             action: { type: 'navigate', path: '/settings?tab=vault' } },
  { id: 'go-settings-navigation',trigger: '/go settings/navigation', label: '/go settings/navigation', sublabel: 'Open Navigation settings tab',        action: { type: 'navigate', path: '/settings?tab=navigation' } },
  { id: 'go-settings-shortcuts', trigger: '/go settings/shortcuts',  label: '/go settings/shortcuts',  sublabel: 'Open Shortcuts settings tab',         action: { type: 'navigate', path: '/settings?tab=shortcuts' } },
  { id: 'go-settings-ai',        trigger: '/go settings/ai',         label: '/go settings/ai',         sublabel: 'Open AI settings tab',                action: { type: 'navigate', path: '/settings?tab=ai' } },
  // /new — open modals
  { id: 'new-entry',             trigger: '/new entry',              label: '/new entry',              sublabel: 'Open the New Entry modal',            action: { type: 'event', name: 'cb:open-new-entry' } },
  // /open — UI actions
  { id: 'open-nav-edit',         trigger: '/open nav-edit',          label: '/open nav-edit',          sublabel: 'Start sidebar navigation reordering', action: { type: 'event', name: 'cb:open-nav-edit' } },
  // /set — feature flags
  { id: 'set-ar-ap-on',          trigger: '/set ar-ap on',           label: '/set ar-ap on',           sublabel: 'Enable the AR/AP module',             action: { type: 'setFlag', key: 'ar_ap', value: true } },
  { id: 'set-ar-ap-off',         trigger: '/set ar-ap off',          label: '/set ar-ap off',          sublabel: 'Disable the AR/AP module',            action: { type: 'setFlag', key: 'ar_ap', value: false } },
  { id: 'set-inventory-on',      trigger: '/set inventory on',       label: '/set inventory on',       sublabel: 'Enable the Inventory module',         action: { type: 'setFlag', key: 'inventory', value: true } },
  { id: 'set-inventory-off',     trigger: '/set inventory off',      label: '/set inventory off',      sublabel: 'Disable the Inventory module',        action: { type: 'setFlag', key: 'inventory', value: false } },
]

export function matchSlashCommands(query: string): SlashCommand[] {
  const q = query.toLowerCase().trim()
  if (!q.startsWith('/')) return []
  return SLASH_COMMANDS.filter((cmd) => cmd.trigger.startsWith(q))
}
```

- [ ] **Step 4: Run the test — expect PASS**

```bash
npx vitest run tests/ui/slashCommands.test.ts
```

Expected: 10 tests passing.

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
git add src/ui/lib/slashCommands.ts tests/ui/slashCommands.test.ts
git commit -m "feat: add slash command registry and matchSlashCommands"
```

---

## Task 3: Wire `cb:open-new-entry` event in `Layout.tsx`

**Files:**
- Modify: `src/ui/components/Layout.tsx`

The `cb:open-new-entry` event lets the CommandPalette open the New Entry modal without prop access. Layout already handles `cb:open-nav-edit` the same way — this is the same pattern.

- [ ] **Step 1: Add the event listener to Layout.tsx**

Find the existing `cb:open-nav-edit` listener block (around line 289):

```typescript
  useEffect(() => {
    function handleOpenNavEdit() { setNavEditMode(true) }
    window.addEventListener('cb:open-nav-edit', handleOpenNavEdit)
    return () => window.removeEventListener('cb:open-nav-edit', handleOpenNavEdit)
  }, [])
```

Add a new `useEffect` immediately after it:

```typescript
  useEffect(() => {
    function handleOpenNewEntry() { setShowNewEntry(true) }
    window.addEventListener('cb:open-new-entry', handleOpenNewEntry)
    return () => window.removeEventListener('cb:open-new-entry', handleOpenNewEntry)
  }, [])
```

- [ ] **Step 2: TypeScript check**

```bash
npx tsc --project src/ui/tsconfig.json --noEmit
```

Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add src/ui/components/Layout.tsx
git commit -m "feat: listen for cb:open-new-entry to open New Entry modal"
```

---

## Task 4: Add slash mode to `CommandPalette.tsx`

**Files:**
- Modify: `src/ui/components/CommandPalette.tsx`

When `query.startsWith('/')`, the palette switches into slash mode: it calls `matchSlashCommands` instead of `useSearch`, renders command items styled with `text-neon font-mono` triggers, and executes the action union on selection. When the query is empty or doesn't start with `/`, behavior is identical to today.

- [ ] **Step 1: Replace `CommandPalette.tsx` with the slash-aware version**

The full replacement file:

```typescript
import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSearch, type SearchResult } from '../hooks/useSearch'
import { matchSlashCommands, type SlashCommand } from '../lib/slashCommands'
import { setFeatureEnabled } from '../lib/featureFlags'

interface Props {
  onClose: () => void
}

const TYPE_LABEL: Record<SearchResult['type'], string> = {
  account: 'Account',
  entry: 'Entry',
  report: 'Report',
  destination: 'Go',
}

export default function CommandPalette({ onClose }: Props) {
  const [query, setQuery] = useState('')
  const [activeIdx, setActiveIdx] = useState(0)
  const navigate = useNavigate()
  const inputRef = useRef<HTMLInputElement>(null)
  const activeRef = useRef<HTMLLIElement>(null)

  const isSlashMode = query.startsWith('/')
  const { results: searchResults, loading, error } = useSearch(isSlashMode ? '' : query)
  const slashMatches = isSlashMode ? matchSlashCommands(query) : []
  const resultCount = isSlashMode ? slashMatches.length : searchResults.length

  useEffect(() => { inputRef.current?.focus() }, [])
  useEffect(() => { setActiveIdx(0) }, [query])

  function executeSlashCommand(cmd: SlashCommand) {
    if (cmd.action.type === 'navigate') {
      navigate(cmd.action.path)
    } else if (cmd.action.type === 'event') {
      window.dispatchEvent(new CustomEvent(cmd.action.name))
    } else if (cmd.action.type === 'setFlag') {
      setFeatureEnabled(cmd.action.key, cmd.action.value)
    }
    onClose()
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') { onClose(); return }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIdx((i) => Math.min(i + 1, resultCount - 1))
      return
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIdx((i) => Math.max(i - 1, 0))
      return
    }
    if (e.key === 'Enter') {
      if (isSlashMode && slashMatches[activeIdx]) {
        executeSlashCommand(slashMatches[activeIdx])
      } else if (!isSlashMode && searchResults[activeIdx]) {
        navigate(searchResults[activeIdx].path)
        onClose()
      }
    }
  }

  function handleSelectSearch(result: SearchResult) {
    navigate(result.path)
    onClose()
  }

  return (
    <div
      className="fixed inset-0 bg-black/60 z-50 flex items-start justify-center pt-24"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg bg-surface border border-rim rounded-sm shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Input row */}
        <div className="flex items-center border-b border-rim px-4">
          <span className="text-ash mr-3 select-none">{isSlashMode ? <span className="text-neon font-mono text-sm">/</span> : '🔍'}</span>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={isSlashMode ? 'Type a command…' : 'Search accounts, entries, reports…'}
            className="flex-1 bg-transparent py-3 text-chalk text-sm placeholder-ash/50 focus:outline-none"
          />
          {loading && !isSlashMode && <span className="text-ash text-xs">…</span>}
          <kbd className="text-ash text-[10px] border border-rim rounded px-1 ml-2">Esc</kbd>
        </div>

        {/* Slash mode: command list */}
        {isSlashMode && slashMatches.length > 0 && (
          <ul className="max-h-64 overflow-y-auto py-1">
            {slashMatches.map((cmd, i) => (
              <li key={cmd.id} ref={i === activeIdx ? activeRef : null}>
                <button
                  onClick={() => executeSlashCommand(cmd)}
                  onMouseEnter={() => setActiveIdx(i)}
                  className={`w-full text-left px-4 py-2.5 flex items-center justify-between transition-colors ${
                    i === activeIdx ? 'bg-raised' : 'hover:bg-raised/50'
                  }`}
                >
                  <div>
                    <span className="text-neon text-xs font-mono">{cmd.label}</span>
                    <span className="text-ash text-[10px] ml-2">{cmd.sublabel}</span>
                  </div>
                  <span className="text-violet text-[10px] uppercase tracking-wider">cmd</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {isSlashMode && slashMatches.length === 0 && query.trim().length <= 1 && (
          <p className="text-ash text-xs px-4 py-3">
            Try <span className="text-neon font-mono">/go</span>, <span className="text-neon font-mono">/new</span>, <span className="text-neon font-mono">/open</span>, or <span className="text-neon font-mono">/set</span>
          </p>
        )}
        {isSlashMode && slashMatches.length === 0 && query.trim().length > 1 && (
          <p className="text-ash text-sm px-4 py-3">No commands match &ldquo;{query}&rdquo;</p>
        )}

        {/* Search mode: async results */}
        {!isSlashMode && searchResults.length > 0 && (
          <ul className="max-h-64 overflow-y-auto py-1">
            {searchResults.map((result, i) => (
              <li key={`${result.type}-${result.id}`} ref={i === activeIdx ? activeRef : null}>
                <button
                  onClick={() => handleSelectSearch(result)}
                  onMouseEnter={() => setActiveIdx(i)}
                  className={`w-full text-left px-4 py-2.5 flex items-center justify-between transition-colors ${
                    i === activeIdx ? 'bg-raised' : 'hover:bg-raised/50'
                  }`}
                >
                  <div>
                    <span className="text-chalk text-xs">{result.label}</span>
                    {result.sublabel && (
                      <span className="text-ash text-[10px] ml-2">{result.sublabel}</span>
                    )}
                  </div>
                  <span className="text-ash text-[10px] uppercase tracking-wider">
                    {TYPE_LABEL[result.type]}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {!isSlashMode && error && (
          <p className="text-red-400 text-xs px-4 py-3">{error}</p>
        )}
        {!isSlashMode && !error && query.trim() && !loading && searchResults.length === 0 && (
          <p className="text-ash text-sm px-4 py-3">No results for &ldquo;{query}&rdquo;</p>
        )}
        {!isSlashMode && !query.trim() && (
          <p className="text-ash text-xs px-4 py-3">
            Type to search · <span className="text-neon font-mono">/</span> for commands
          </p>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: TypeScript check**

```bash
npx tsc --project src/ui/tsconfig.json --noEmit
```

Expected: 0 errors. If you see an error about `activeRef` being declared but not used — the ref is assigned via the `ref={i === activeIdx ? activeRef : null}` prop on `<li>`, so it is used. If TypeScript flags it, add `void activeRef` as a no-op after the ref declaration.

- [ ] **Step 3: Run full test suite**

```bash
npx vitest run
```

Expected: all tests passing.

- [ ] **Step 4: Manual smoke test**

Start the dev server:

```bash
npm run dev
```

Open the app in a browser at `http://localhost:5173`.

Verify each of the following:

| Action | Expected result |
|--------|-----------------|
| Click the search bar or press the `global-search` shortcut | CommandPalette opens |
| Empty state | Footer shows "Type to search · / for commands" |
| Type `accounts` | Shows async search results (Accounts, Entries, etc.) with no slash-mode UI |
| Clear query, type `/` | Slash mode activates: header icon switches to neon `/`, footer shows try `/go`, `/new`, etc. All commands appear in list |
| Type `/go` | List narrows to only `/go *` commands |
| Type `/go home` | Single result: `/go home — Navigate to Home` |
| Press Enter or click `/go home` | Navigates to `/home`, palette closes |
| Open palette, type `/new entry`, press Enter | New Entry modal opens |
| Open palette, type `/open nav-edit`, press Enter | Sidebar enters nav edit mode (violet "editing nav" banner appears) |
| Open palette, type `/set ar-ap on`, press Enter | Palette closes; navigate to `/settings?tab=navigation` and confirm no AR/AP section yet (feature flag change is confirmed by reopening palette, typing `/set ar-ap off`) |
| Open palette, type `/xyz` | "No commands match "/xyz"" shown |
| Press Esc | Palette closes |
| Arrow keys navigate the command list | Active item highlights with `bg-raised` |

- [ ] **Step 5: Commit**

```bash
git add src/ui/components/CommandPalette.tsx
git commit -m "feat: add slash command mode to CommandPalette"
```

---

## Spec Self-Review

**1. Spec coverage check**

- `/go` namespace: ✅ 14 destinations covered (home, accounts, entries, drafts, reports, recurring, close-period, bank-feed, reconciliation, settings, settings/vault, settings/navigation, settings/shortcuts, settings/ai)
- `/new entry`: ✅ fires `cb:open-new-entry`, Layout listens (Task 3)
- `/open nav-edit`: ✅ fires `cb:open-nav-edit` (existing Layout listener from Plan A)
- `/set ar-ap on/off`, `/set inventory on/off`: ✅ calls `setFeatureEnabled` (Task 1)
- `matchSlashCommands` case-insensitive: ✅ tested
- Empty palette hint text updated: ✅ Task 4
- Error display preserved in search mode: ✅ Task 4

**2. Placeholder scan** — no TBDs, all code is complete.

**3. Type consistency**
- `SlashCommand.action` discriminated union is defined in Task 2 and consumed identically in Task 4's `executeSlashCommand`.
- `setFeatureEnabled` added in Task 1, imported in Task 4's CommandPalette.
- `matchSlashCommands` defined in Task 2, imported in Task 4.
- `activeRef` is assigned (via JSX `ref` prop) and declared — no lint issue.
