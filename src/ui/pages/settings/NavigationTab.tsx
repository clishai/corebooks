import { useState } from 'react'
import { getSidebarWide, setSidebarWide, getNavSectionOrder, saveNavSectionOrder, type NavSectionId } from '../../lib/sidebarLayout'

const SECTION_LABELS: Record<NavSectionId, string> = {
  ledger: 'Ledger',
  reports: 'Reports',
  'extra-workflows': 'Extra Workflows',
}

export default function NavigationTab() {
  const [wide, setWide] = useState(getSidebarWide)
  const [order, setOrder] = useState<NavSectionId[]>(getNavSectionOrder)

  function handleToggle(value: boolean): void {
    setWide(value)
    setSidebarWide(value)
    window.dispatchEvent(new CustomEvent('cb:sidebar-wide-changed', { detail: { wide: value } }))
  }

  function move(index: number, direction: -1 | 1): void {
    const next = [...order]
    const target = index + direction
    if (target < 0 || target >= next.length) return
    ;[next[index], next[target]] = [next[target], next[index]]
    setOrder(next)
    saveNavSectionOrder(next)
    window.dispatchEvent(new CustomEvent('cb:nav-order-changed'))
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
        <h3 className="text-sm font-semibold text-chalk">Section order</h3>
        <p className="text-sm text-ash leading-relaxed">
          Drag sections into the order you want them to appear in the sidebar.
          Home and Settings are always pinned.
        </p>
        <div className="bg-surface border border-rim rounded-lg divide-y divide-rim">
          {order.map((sectionId, index) => (
            <div key={sectionId} className="flex items-center justify-between px-4 py-3">
              <span className="text-sm text-chalk">{SECTION_LABELS[sectionId]}</span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => move(index, -1)}
                  disabled={index === 0}
                  title="Move up"
                  className="flex items-center justify-center w-7 h-7 rounded text-ash hover:text-chalk hover:bg-raised transition-colors disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="18 15 12 9 6 15" />
                  </svg>
                </button>
                <button
                  onClick={() => move(index, 1)}
                  disabled={index === order.length - 1}
                  title="Move down"
                  className="flex items-center justify-center w-7 h-7 rounded text-ash hover:text-chalk hover:bg-raised transition-colors disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </button>
              </div>
            </div>
          ))}
        </div>
        <p className="text-xs text-ash">Changes apply to the sidebar immediately.</p>
      </div>
    </div>
  )
}
