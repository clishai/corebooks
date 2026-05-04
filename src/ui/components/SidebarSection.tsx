// src/ui/components/SidebarSection.tsx
import { useState } from 'react'
import { isSectionCollapsed, toggleSectionCollapsed } from '../lib/sidebarState'

interface Props {
  id: 'ledger' | 'reports' | 'extra-workflows' | 'plugins'
  label: string
  children: React.ReactNode
}

export default function SidebarSection({ id, label, children }: Props) {
  const [collapsed, setCollapsed] = useState(() => isSectionCollapsed(id))

  function toggle() {
    toggleSectionCollapsed(id)
    setCollapsed((c) => !c)
  }

  return (
    <div className="mb-1">
      <button
        onClick={toggle}
        className="w-full flex items-center justify-between px-3 py-1.5 text-[10px] font-semibold text-ash uppercase tracking-widest hover:text-chalk transition-colors"
      >
        <span>{label}</span>
        <span className={`transition-transform duration-150 ${collapsed ? '-rotate-90' : ''}`}>▾</span>
      </button>
      {!collapsed && <div className="space-y-0.5">{children}</div>}
    </div>
  )
}
