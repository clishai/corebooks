# Phase 8: Global Search Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Activate the ghost search bar in the toolbar and add a command-palette overlay. Pressing `/` or clicking the bar opens it. Results are grouped by Accounts, Entries, and Reports — keyboard-navigable.

**Architecture:** `useSearch` hook handles debounced querying of existing API endpoints. `CommandPalette` renders the overlay. `Layout.tsx` wires the `/` shortcut and passes open/close state down. No new API endpoints needed.

**Tech Stack:** React 19, Tailwind v4

---

### Task 1: useSearch hook

**Files:**
- Create: `src/ui/hooks/useSearch.ts`

- [ ] **Step 1: Write the hook**

```typescript
// src/ui/hooks/useSearch.ts
import { useState, useEffect, useCallback } from 'react'
import { listAccounts, listEntries } from '../api/client'
import { ALL_REPORTS, type ReportMeta } from '../lib/reports'

export interface SearchResult {
  id: string
  type: 'account' | 'entry' | 'report'
  label: string
  sublabel?: string
  path: string
}

function matchesQuery(text: string, query: string): boolean {
  return text.toLowerCase().includes(query.toLowerCase())
}

export function useSearch(query: string): { results: SearchResult[]; loading: boolean } {
  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)

  const search = useCallback(async (q: string) => {
    if (!q.trim()) { setResults([]); return }
    setLoading(true)
    try {
      const [accounts, entries] = await Promise.all([
        listAccounts(),
        listEntries(),
      ])

      const accountResults: SearchResult[] = accounts
        .filter((a) => matchesQuery(a.name, q) || matchesQuery(a.number, q))
        .slice(0, 5)
        .map((a) => ({
          id: a.id,
          type: 'account',
          label: `${a.number} — ${a.name}`,
          sublabel: a.type,
          path: '/accounts',
        }))

      const entryResults: SearchResult[] = entries
        .filter((e) =>
          matchesQuery(e.memo ?? '', q) ||
          matchesQuery(e.date?.slice(0, 10) ?? '', q)
        )
        .slice(0, 5)
        .map((e) => ({
          id: e.id,
          type: 'entry',
          label: e.memo || '(no memo)',
          sublabel: e.date?.slice(0, 10),
          path: '/entries',
        }))

      const reportResults: SearchResult[] = ALL_REPORTS
        .filter((r) => matchesQuery(r.label, q))
        .map((r: ReportMeta) => ({
          id: r.id,
          type: 'report',
          label: r.label,
          sublabel: r.description,
          path: r.path,
        }))

      setResults([...accountResults, ...entryResults, ...reportResults])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const t = setTimeout(() => search(query), 200)
    return () => clearTimeout(t)
  }, [query, search])

  return { results, loading }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/ui/hooks/useSearch.ts
git commit -m "feat: add useSearch hook"
```

---

### Task 2: CommandPalette component

**Files:**
- Create: `src/ui/components/CommandPalette.tsx`

- [ ] **Step 1: Write the component**

```typescript
// src/ui/components/CommandPalette.tsx
import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSearch, type SearchResult } from '../hooks/useSearch'

interface Props {
  onClose: () => void
}

const TYPE_LABEL: Record<SearchResult['type'], string> = {
  account: 'Account',
  entry: 'Entry',
  report: 'Report',
}

export default function CommandPalette({ onClose }: Props) {
  const [query, setQuery] = useState('')
  const [activeIdx, setActiveIdx] = useState(0)
  const { results, loading } = useSearch(query)
  const navigate = useNavigate()
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { inputRef.current?.focus() }, [])
  useEffect(() => { setActiveIdx(0) }, [results])

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') { onClose(); return }
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIdx((i) => Math.min(i + 1, results.length - 1)); return }
    if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIdx((i) => Math.max(i - 1, 0)); return }
    if (e.key === 'Enter' && results[activeIdx]) {
      navigate(results[activeIdx].path)
      onClose()
    }
  }

  function handleSelect(result: SearchResult) {
    navigate(result.path)
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-start justify-center pt-24" onClick={onClose}>
      <div
        className="w-full max-w-lg bg-surface border border-rim rounded-sm shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center border-b border-rim px-4">
          <span className="text-ash mr-3">🔍</span>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search accounts, entries, reports..."
            className="flex-1 bg-transparent py-3 text-chalk text-sm placeholder-ash/50 focus:outline-none"
          />
          {loading && <span className="text-ash text-xs">…</span>}
          <kbd className="text-ash text-[10px] border border-rim rounded px-1 ml-2">Esc</kbd>
        </div>

        {results.length > 0 && (
          <ul className="max-h-64 overflow-y-auto py-1">
            {results.map((result, i) => (
              <li key={result.id}>
                <button
                  onClick={() => handleSelect(result)}
                  onMouseEnter={() => setActiveIdx(i)}
                  className={`w-full text-left px-4 py-2.5 flex items-center justify-between transition-colors ${
                    i === activeIdx ? 'bg-raised' : 'hover:bg-raised/50'
                  }`}
                >
                  <div>
                    <span className="text-chalk text-sm">{result.label}</span>
                    {result.sublabel && (
                      <span className="text-ash text-xs ml-2">{result.sublabel}</span>
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

        {query.trim() && !loading && results.length === 0 && (
          <p className="text-ash text-sm px-4 py-3">No results for "{query}"</p>
        )}

        {!query.trim() && (
          <p className="text-ash text-xs px-4 py-3">
            Type to search accounts, entries, and reports.
          </p>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/ui/components/CommandPalette.tsx
git commit -m "feat: add CommandPalette overlay component"
```

---

### Task 3: Wire search into Layout

**Files:**
- Modify: `src/ui/components/Layout.tsx`

- [ ] **Step 1: Add command palette state and wire search bar**

```typescript
import CommandPalette from './CommandPalette'
// ...
const [showSearch, setShowSearch] = useState(false)
```

Replace the ghost search bar `<input>` with:
```tsx
<button
  onClick={() => setShowSearch(true)}
  className="w-full bg-surface border border-rim rounded-sm px-3 py-1 text-xs text-ash/50 text-left hover:border-neon/50 transition-colors focus:outline-none"
>
  search...
</button>
```

Add below the toolbar:
```tsx
{showSearch && <CommandPalette onClose={() => setShowSearch(false)} />}
```

Update the global-search shortcut handler:
```typescript
'global-search': () => setShowSearch(true),
```

- [ ] **Step 2: Type check**

```bash
npx tsc --project src/ui/tsconfig.json --noEmit
```
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/ui/components/Layout.tsx
git commit -m "feat: activate global search — toolbar button + command palette"
```
