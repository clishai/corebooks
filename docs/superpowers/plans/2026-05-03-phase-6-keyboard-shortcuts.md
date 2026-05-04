# Phase 6: Keyboard Shortcuts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement configurable keyboard shortcuts with a Shortcuts tab in Settings. `Cmd/Ctrl` for actions, `Shift` for navigation. Bindings stored in localStorage. Conflicts highlighted in amber.

**Architecture:** `src/ui/lib/shortcuts.ts` manages bindings. `useKeyboardShortcuts` hook registers global listeners. `ShortcutRecorder` is a click-to-record input. `Layout.tsx` wires global shortcuts. Settings adds a Shortcuts tab.

**Tech Stack:** React 19, Tailwind v4

---

### Task 1: Shortcuts library

**Files:**
- Create: `src/ui/lib/shortcuts.ts`

- [ ] **Step 1: Write the file**

```typescript
// src/ui/lib/shortcuts.ts

const STORAGE_KEY = 'cb_shortcuts'

export interface ShortcutBinding {
  key: string        // e.g. "n", "Enter", "/"
  meta: boolean      // Cmd/Ctrl
  shift: boolean
  alt: boolean
}

export type ShortcutId =
  | 'new-entry'
  | 'save-draft'
  | 'post-entry'
  | 'global-search'
  | 'go-home'
  | 'go-entries'
  | 'go-accounts'
  | 'go-drafts'
  | 'go-recurring'
  | 'pin-report'
  | 'go-close-period'

export const DEFAULT_SHORTCUTS: Record<ShortcutId, ShortcutBinding> = {
  'new-entry':      { key: 'n',      meta: true,  shift: false, alt: false },
  'save-draft':     { key: 's',      meta: true,  shift: false, alt: false },
  'post-entry':     { key: 'Enter',  meta: true,  shift: false, alt: false },
  'global-search':  { key: '/',      meta: false, shift: false, alt: false },
  'go-home':        { key: 'h',      meta: false, shift: true,  alt: false },
  'go-entries':     { key: 'e',      meta: false, shift: true,  alt: false },
  'go-accounts':    { key: 'a',      meta: false, shift: true,  alt: false },
  'go-drafts':      { key: 'd',      meta: false, shift: true,  alt: false },
  'go-recurring':   { key: 'r',      meta: false, shift: true,  alt: false },
  'pin-report':     { key: 'p',      meta: false, shift: true,  alt: false },
  'go-close-period':{ key: 'c',      meta: false, shift: true,  alt: false },
}

export const SHORTCUT_LABELS: Record<ShortcutId, string> = {
  'new-entry':       'New entry',
  'save-draft':      'Save draft',
  'post-entry':      'Post entry',
  'global-search':   'Global search',
  'go-home':         'Go to Home',
  'go-entries':      'Go to Entries',
  'go-accounts':     'Go to Accounts',
  'go-drafts':       'Go to Drafts',
  'go-recurring':    'Go to Recurring',
  'pin-report':      'Pin/unpin current report',
  'go-close-period': 'Open Close Period',
}

export function getShortcuts(): Record<ShortcutId, ShortcutBinding> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? { ...DEFAULT_SHORTCUTS, ...JSON.parse(raw) } : { ...DEFAULT_SHORTCUTS }
  } catch {
    return { ...DEFAULT_SHORTCUTS }
  }
}

export function saveShortcuts(shortcuts: Record<ShortcutId, ShortcutBinding>): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(shortcuts))
}

export function formatBinding(b: ShortcutBinding): string {
  const parts: string[] = []
  if (b.meta) parts.push('⌘/Ctrl')
  if (b.shift) parts.push('Shift')
  if (b.alt) parts.push('Alt')
  parts.push(b.key === ' ' ? 'Space' : b.key.toUpperCase())
  return parts.join(' + ')
}

export function bindingFromKeyboardEvent(e: KeyboardEvent): ShortcutBinding {
  return {
    key: e.key,
    meta: e.metaKey || e.ctrlKey,
    shift: e.shiftKey,
    alt: e.altKey,
  }
}

export function bindingsMatch(a: ShortcutBinding, b: ShortcutBinding): boolean {
  return a.key.toLowerCase() === b.key.toLowerCase() &&
    a.meta === b.meta &&
    a.shift === b.shift &&
    a.alt === b.alt
}

export function findConflict(
  id: ShortcutId,
  binding: ShortcutBinding,
  all: Record<ShortcutId, ShortcutBinding>
): ShortcutId | null {
  for (const [otherId, other] of Object.entries(all) as [ShortcutId, ShortcutBinding][]) {
    if (otherId !== id && bindingsMatch(binding, other)) return otherId
  }
  return null
}
```

- [ ] **Step 2: Commit**

```bash
git add src/ui/lib/shortcuts.ts
git commit -m "feat: add keyboard shortcuts library"
```

---

### Task 2: useKeyboardShortcuts hook

**Files:**
- Create: `src/ui/hooks/useKeyboardShortcuts.ts`

- [ ] **Step 1: Write the hook**

```typescript
// src/ui/hooks/useKeyboardShortcuts.ts
import { useEffect } from 'react'
import { getShortcuts, bindingFromKeyboardEvent, bindingsMatch, type ShortcutId } from '../lib/shortcuts'

type ShortcutHandlers = Partial<Record<ShortcutId, () => void>>

export function useKeyboardShortcuts(handlers: ShortcutHandlers) {
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Don't fire when user is typing in an input/textarea/select
      const tag = (e.target as HTMLElement).tagName
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(tag)) {
        // Allow Escape and Cmd shortcuts even from inputs
        if (e.key !== 'Escape' && !e.metaKey && !e.ctrlKey) return
      }

      const pressed = bindingFromKeyboardEvent(e)
      const shortcuts = getShortcuts()

      for (const [id, binding] of Object.entries(shortcuts) as [ShortcutId, typeof binding][]) {
        if (bindingsMatch(pressed, binding) && handlers[id]) {
          e.preventDefault()
          handlers[id]!()
          return
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handlers])
}
```

- [ ] **Step 2: Commit**

```bash
git add src/ui/hooks/useKeyboardShortcuts.ts
git commit -m "feat: add useKeyboardShortcuts hook"
```

---

### Task 3: Wire global shortcuts into Layout

**Files:**
- Modify: `src/ui/components/Layout.tsx`

- [ ] **Step 1: Import and wire shortcuts**

Add to `Layout.tsx`:
```typescript
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts'
```

Inside the `Layout` component, after the existing state/effects:
```typescript
useKeyboardShortcuts({
  'new-entry': () => setShowNewEntry(true),
  'go-home': () => navigate('/home'),
  'go-entries': () => navigate('/entries'),
  'go-accounts': () => navigate('/accounts'),
  'go-drafts': () => navigate('/drafts'),
  'go-recurring': () => navigate('/extra/recurring'),
  'go-close-period': () => navigate('/extra/close-period'),
  'global-search': () => {/* Phase 8 */},
})
```

- [ ] **Step 2: Type check**

```bash
npx tsc --project src/ui/tsconfig.json --noEmit
```
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/ui/components/Layout.tsx
git commit -m "feat: wire global keyboard shortcuts into Layout"
```

---

### Task 4: ShortcutRecorder component

**Files:**
- Create: `src/ui/components/ShortcutRecorder.tsx`

- [ ] **Step 1: Write the component**

```typescript
// src/ui/components/ShortcutRecorder.tsx
import { useState, useRef } from 'react'
import { type ShortcutBinding, formatBinding, bindingFromKeyboardEvent } from '../lib/shortcuts'

interface Props {
  binding: ShortcutBinding
  onChange: (binding: ShortcutBinding) => void
  conflict?: string | null
}

export default function ShortcutRecorder({ binding, onChange, conflict }: Props) {
  const [recording, setRecording] = useState(false)
  const inputRef = useRef<HTMLButtonElement>(null)

  function handleKeyDown(e: React.KeyboardEvent) {
    e.preventDefault()
    e.stopPropagation()
    if (e.key === 'Escape') { setRecording(false); return }
    if (['Meta', 'Control', 'Shift', 'Alt'].includes(e.key)) return
    onChange(bindingFromKeyboardEvent(e.nativeEvent))
    setRecording(false)
  }

  return (
    <div className="flex items-center gap-2">
      <button
        ref={inputRef}
        onKeyDown={recording ? handleKeyDown : undefined}
        onClick={() => { setRecording(true); inputRef.current?.focus() }}
        onBlur={() => setRecording(false)}
        className={`min-w-[120px] text-left px-3 py-1.5 rounded-sm border text-xs font-mono transition-colors focus:outline-none ${
          recording
            ? 'border-neon bg-raised text-neon'
            : conflict
            ? 'border-amber-500 bg-raised text-amber-400'
            : 'border-rim bg-raised text-chalk hover:border-neon/50'
        }`}
      >
        {recording ? 'Press keys…' : formatBinding(binding)}
      </button>
      {conflict && (
        <span className="text-amber-400 text-xs">conflicts with "{conflict}"</span>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/ui/components/ShortcutRecorder.tsx
git commit -m "feat: add ShortcutRecorder click-to-record input"
```

---

### Task 5: Shortcuts tab in Settings

**Files:**
- Modify: `src/ui/pages/SettingsPage.tsx`

- [ ] **Step 1: Add ShortcutsSettings component**

Add to `SettingsPage.tsx`:
```typescript
import ShortcutRecorder from '../components/ShortcutRecorder'
import {
  getShortcuts, saveShortcuts, SHORTCUT_LABELS, findConflict,
  type ShortcutId, type ShortcutBinding
} from '../lib/shortcuts'

function ShortcutsSettings() {
  const [bindings, setBindings] = useState(() => getShortcuts())

  function handleChange(id: ShortcutId, binding: ShortcutBinding) {
    const next = { ...bindings, [id]: binding }
    setBindings(next)
    saveShortcuts(next)
  }

  return (
    <div className="space-y-1 max-w-lg">
      <p className="text-ash text-xs mb-4">Click a binding to record a new shortcut. Press Esc to cancel.</p>
      {(Object.entries(SHORTCUT_LABELS) as [ShortcutId, string][]).map(([id, label]) => {
        const conflict = findConflict(id, bindings[id], bindings)
        const conflictLabel = conflict ? SHORTCUT_LABELS[conflict] : null
        return (
          <div key={id} className="flex items-center justify-between py-2 border-b border-rim/40">
            <span className="text-chalk text-sm">{label}</span>
            <ShortcutRecorder
              binding={bindings[id]}
              onChange={(b) => handleChange(id, b)}
              conflict={conflictLabel}
            />
          </div>
        )
      })}
    </div>
  )
}
```

Add `"shortcuts"` to the settings tabs array and render `<ShortcutsSettings />` for that tab.

- [ ] **Step 2: Type check**

```bash
npx tsc --project src/ui/tsconfig.json --noEmit
```
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/ui/pages/SettingsPage.tsx
git commit -m "feat: add Shortcuts tab to Settings with live rebinding"
```
