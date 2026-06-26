import { useState } from 'react'
import { getSidebarWide, setSidebarWide } from '../../lib/sidebarLayout'

export default function NavigationTab() {
  const [wide, setWide] = useState(getSidebarWide)

  function handleToggle(value: boolean): void {
    setWide(value)
    setSidebarWide(value)
    window.dispatchEvent(new CustomEvent('cb:sidebar-wide-changed', { detail: { wide: value } }))
  }

  return (
    <div className="space-y-8">
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-chalk">Sidebar default state</h3>
        <p className="text-sm text-ash leading-relaxed">
          Whether the sidebar starts expanded or collapsed when you open the app.
        </p>
        <div className="flex gap-2">
          {([true, false] as const).map((value) => (
            <button
              key={String(value)}
              onClick={() => handleToggle(value)}
              className={`px-4 py-2 text-sm rounded-md border transition-colors cursor-pointer ${
                wide === value
                  ? 'bg-neon/10 border-neon text-neon'
                  : 'border-rim text-ash hover:text-chalk hover:border-chalk/30'
              }`}
            >
              {value ? 'Expanded' : 'Collapsed'}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-chalk">Reorder navigation sections</h3>
        <p className="text-sm text-ash leading-relaxed">
          Drag sections to reorder them in the sidebar. Home and Settings are always pinned.
        </p>
        <button
          onClick={() => window.dispatchEvent(new CustomEvent('cb:open-nav-edit'))}
          className="px-4 py-2 text-sm rounded-md border border-rim text-ash hover:text-chalk hover:border-chalk/30 transition-colors cursor-pointer"
        >
          Edit sidebar order →
        </button>
      </div>
    </div>
  )
}
