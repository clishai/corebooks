import { useEffect } from 'react'
import {
  getShortcuts,
  bindingFromKeyboardEvent,
  bindingsMatch,
  type ShortcutId,
  type ShortcutBinding,
} from '../lib/shortcuts'

type ShortcutHandlers = Partial<Record<ShortcutId, () => void>>

export function useKeyboardShortcuts(handlers: ShortcutHandlers) {
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement).tagName
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(tag)) {
        if (e.key !== 'Escape' && !e.metaKey && !e.ctrlKey) return
      }
      const pressed = bindingFromKeyboardEvent(e)
      const shortcuts = getShortcuts()
      for (const [id, binding] of Object.entries(shortcuts) as [ShortcutId, ShortcutBinding][]) {
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
