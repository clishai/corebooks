const STORAGE_KEY = 'cb_shortcuts'

export interface ShortcutBinding {
  key: string
  meta: boolean
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
  'new-entry':       { key: 'n',     meta: true,  shift: false, alt: false },
  'save-draft':      { key: 's',     meta: true,  shift: false, alt: false },
  'post-entry':      { key: 'Enter', meta: true,  shift: false, alt: false },
  'global-search':   { key: '/',     meta: false, shift: false, alt: false },
  'go-home':         { key: 'h',     meta: false, shift: true,  alt: false },
  'go-entries':      { key: 'e',     meta: false, shift: true,  alt: false },
  'go-accounts':     { key: 'a',     meta: false, shift: true,  alt: false },
  'go-drafts':       { key: 'd',     meta: false, shift: true,  alt: false },
  'go-recurring':    { key: 'r',     meta: false, shift: true,  alt: false },
  'pin-report':      { key: 'p',     meta: false, shift: true,  alt: false },
  'go-close-period': { key: 'c',     meta: false, shift: true,  alt: false },
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
  window.dispatchEvent(new CustomEvent('cb:shortcuts-changed'))
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
  return { key: e.key, meta: e.metaKey || e.ctrlKey, shift: e.shiftKey, alt: e.altKey }
}

export function bindingsMatch(a: ShortcutBinding, b: ShortcutBinding): boolean {
  return (
    a.key.toLowerCase() === b.key.toLowerCase() &&
    a.meta === b.meta &&
    a.shift === b.shift &&
    a.alt === b.alt
  )
}

export function findConflict(
  id: ShortcutId,
  binding: ShortcutBinding,
  all: Record<ShortcutId, ShortcutBinding>,
): ShortcutId | null {
  for (const [otherId, other] of Object.entries(all) as [ShortcutId, ShortcutBinding][]) {
    if (otherId !== id && bindingsMatch(binding, other)) return otherId
  }
  return null
}
