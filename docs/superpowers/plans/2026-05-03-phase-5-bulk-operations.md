# Phase 5: Bulk Operations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add multi-select with a floating action bar to Drafts, Entries, and Accounts pages. Checkboxes appear on row hover; a sticky bar slides up from the bottom when rows are selected.

**Architecture:** A shared `BulkActionBar` component receives selected IDs and a list of actions. Each page manages its own selection state. No new API endpoints needed — bulk operations call existing endpoints in sequence.

**Tech Stack:** React 19, Tailwind v4

---

### Task 1: BulkActionBar component

**Files:**
- Create: `src/ui/components/BulkActionBar.tsx`

- [ ] **Step 1: Write the component**

```typescript
// src/ui/components/BulkActionBar.tsx

interface BulkAction {
  label: string
  onClick: () => void
  destructive?: boolean
}

interface Props {
  count: number
  actions: BulkAction[]
  onClear: () => void
}

export default function BulkActionBar({ count, actions, onClear }: Props) {
  if (count === 0) return null
  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 bg-raised border border-neon/40 rounded-sm px-5 py-3 shadow-lg shadow-black/40 animate-slide-up">
      <span className="text-ash text-xs">{count} selected</span>
      <div className="w-px h-4 bg-rim" />
      {actions.map((action) => (
        <button
          key={action.label}
          onClick={action.onClick}
          className={`text-xs font-medium transition-colors ${
            action.destructive
              ? 'text-red-400 hover:text-red-300'
              : 'text-neon hover:text-chalk'
          }`}
        >
          {action.label}
        </button>
      ))}
      <div className="w-px h-4 bg-rim" />
      <button onClick={onClear} className="text-ash hover:text-chalk text-xs transition-colors">
        Clear
      </button>
    </div>
  )
}
```

Add to `src/ui/index.css`:
```css
@keyframes slide-up {
  from { transform: translateX(-50%) translateY(20px); opacity: 0; }
  to   { transform: translateX(-50%) translateY(0); opacity: 1; }
}
.animate-slide-up {
  animation: slide-up 180ms ease both;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/ui/components/BulkActionBar.tsx src/ui/index.css
git commit -m "feat: add BulkActionBar component"
```

---

### Task 2: Multi-select on DraftsPage

**Files:**
- Modify: `src/ui/pages/DraftsPage.tsx`

- [ ] **Step 1: Add selection state and bulk actions**

At the top of `DraftsPage`, add:
```typescript
import BulkActionBar from '../components/BulkActionBar'
// ...
const [selected, setSelected] = useState<Set<string>>(new Set())

function toggleSelect(id: string) {
  setSelected((prev) => {
    const next = new Set(prev)
    next.has(id) ? next.delete(id) : next.add(id)
    return next
  })
}
function clearSelection() { setSelected(new Set()) }
```

- [ ] **Step 2: Add checkbox column to each row**

In the table row, add as the first cell:
```tsx
<td className="py-2 px-2 w-8">
  <input
    type="checkbox"
    checked={selected.has(entry.id)}
    onChange={() => toggleSelect(entry.id)}
    className="opacity-0 group-hover:opacity-100 checked:opacity-100 accent-neon transition-opacity"
    onClick={(e) => e.stopPropagation()}
  />
</td>
```

Add `group` class to the `<tr>` element.

- [ ] **Step 3: Add BulkActionBar**

After the table, before the closing `</div>`:
```tsx
<BulkActionBar
  count={selected.size}
  onClear={clearSelection}
  actions={[
    {
      label: 'Post selected',
      onClick: async () => {
        for (const id of selected) {
          try { await postDraftEntry(id) } catch { /* skip invalid */ }
        }
        clearSelection()
        load()
      },
    },
    {
      label: 'Delete selected',
      destructive: true,
      onClick: async () => {
        if (!confirm(`Delete ${selected.size} draft(s)?`)) return
        for (const id of selected) {
          try { await deleteDraftEntry(id) } catch { /* skip */ }
        }
        clearSelection()
        load()
      },
    },
    {
      label: 'Export selected',
      onClick: () => {
        const entries = drafts.filter((d) => selected.has(d.id))
        const blob = new Blob([JSON.stringify(entries, null, 2)], { type: 'application/json' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `corebooks-drafts-${new Date().toISOString().slice(0, 10)}.json`
        a.click()
        URL.revokeObjectURL(url)
      },
    },
  ]}
/>
```

- [ ] **Step 4: Add Esc handler to clear selection**

```typescript
useEffect(() => {
  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === 'Escape') clearSelection()
  }
  window.addEventListener('keydown', handleKeyDown)
  return () => window.removeEventListener('keydown', handleKeyDown)
}, [])
```

- [ ] **Step 5: Type check**

```bash
npx tsc --project src/ui/tsconfig.json --noEmit
```
Expected: no errors

- [ ] **Step 6: Commit**

```bash
git add src/ui/pages/DraftsPage.tsx
git commit -m "feat: add bulk select to DraftsPage"
```

---

### Task 3: Multi-select on EntriesPage

**Files:**
- Modify: `src/ui/pages/EntriesPage.tsx`

Follow the same pattern as Task 2. Actions for EntriesPage:

- **Export selected** — same download logic as Drafts
- **Reverse selected** — calls `reverseEntry(id)` for each selected entry; confirm first

```typescript
// Reverse action
{
  label: 'Reverse selected',
  onClick: async () => {
    if (!confirm(`Reverse ${selected.size} entr(ies)? This creates offsetting entries.`)) return
    for (const id of selected) {
      try { await reverseEntry(id) } catch { /* skip */ }
    }
    clearSelection()
    load()
  },
},
```

- [ ] **Step 1: Apply the same checkbox, BulkActionBar, and Esc handler pattern**
- [ ] **Step 2: Type check** — `npx tsc --project src/ui/tsconfig.json --noEmit`
- [ ] **Step 3: Commit** — `git commit -m "feat: add bulk select to EntriesPage"`

---

### Task 4: Multi-select on AccountsPage

**Files:**
- Modify: `src/ui/pages/AccountsPage.tsx`

Same pattern. Action for AccountsPage:

- **Change classification** — presents a dialog asking current/non-current, then calls `updateAccount(id, { classification })` for each selected account

```typescript
{
  label: 'Set classification',
  onClick: async () => {
    const val = prompt('Set classification: type "current" or "non-current"')
    if (val !== 'current' && val !== 'non-current') return
    for (const id of selected) {
      try { await updateAccount(id, { classification: val }) } catch { /* skip */ }
    }
    clearSelection()
    load()
  },
},
```

- [ ] **Step 1: Apply the same checkbox, BulkActionBar, and Esc handler pattern**
- [ ] **Step 2: Type check** — `npx tsc --project src/ui/tsconfig.json --noEmit`
- [ ] **Step 3: Commit** — `git commit -m "feat: add bulk select to AccountsPage"`
