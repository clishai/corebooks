import { useState } from 'react'
import ShortcutRecorder from '../../components/ShortcutRecorder'
import {
  getShortcuts,
  saveShortcuts,
  SHORTCUT_LABELS,
  findConflict,
  type ShortcutId,
  type ShortcutBinding,
} from '../../lib/shortcuts'

export default function ShortcutsTab() {
  const [bindings, setBindings] = useState(() => getShortcuts())

  function handleChange(id: ShortcutId, binding: ShortcutBinding) {
    const next = { ...bindings, [id]: binding }
    setBindings(next)
    saveShortcuts(next)
  }

  return (
    <div className="space-y-1 max-w-lg">
      <p className="text-ash text-xs mb-4">
        Click a binding to record a new shortcut. Press Esc to cancel.
      </p>
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
