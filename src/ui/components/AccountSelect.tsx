import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import type { Account } from '../api/client'

interface Props {
  accounts: Account[]
  value: string
  onChange: (id: string) => void
}

export default function AccountSelect({ accounts, value, onChange }: Props) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [pos, setPos] = useState({ top: 0, left: 0, width: 0 })
  const triggerRef = useRef<HTMLButtonElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  const selected = accounts.find((a) => a.id === value)

  const filtered = search.trim()
    ? accounts.filter(
        (a) =>
          a.name.toLowerCase().includes(search.toLowerCase()) ||
          a.number.toLowerCase().includes(search.toLowerCase()),
      )
    : accounts

  function openDropdown() {
    if (!triggerRef.current) return
    const rect = triggerRef.current.getBoundingClientRect()
    setPos({ top: rect.bottom + 2, left: rect.left, width: rect.width })
    setOpen(true)
  }

  useEffect(() => {
    if (open) {
      const id = requestAnimationFrame(() => searchRef.current?.focus())
      return () => cancelAnimationFrame(id)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    function handlePointerDown(e: PointerEvent) {
      if (triggerRef.current?.contains(e.target as Node)) return
      setOpen(false)
      setSearch('')
    }
    document.addEventListener('pointerdown', handlePointerDown)
    return () => document.removeEventListener('pointerdown', handlePointerDown)
  }, [open])

  function select(id: string) {
    onChange(id)
    setOpen(false)
    setSearch('')
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={openDropdown}
        className="w-full px-2 py-1.5 text-sm rounded bg-raised text-left flex items-center justify-between gap-1 focus:outline-none focus:ring-2 focus:ring-neon cursor-pointer"
      >
        {selected ? (
          <span className="text-chalk truncate">
            <span className="text-ash font-mono text-xs mr-1">{selected.number}</span>
            {selected.name}
          </span>
        ) : (
          <span className="text-ash">— select —</span>
        )}
        <span className="text-ash text-[10px] shrink-0">▾</span>
      </button>

      {open &&
        createPortal(
          <div
            style={{ top: pos.top, left: pos.left, width: Math.max(pos.width, 260) }}
            className="fixed z-[9999] bg-surface border border-rim rounded shadow-2xl flex flex-col max-h-60"
          >
            <div className="p-2 border-b border-rim shrink-0">
              <input
                ref={searchRef}
                placeholder="Search accounts…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') { setOpen(false); setSearch('') }
                  if (e.key === 'Enter' && filtered.length === 1) select(filtered[0].id)
                }}
                className="w-full bg-raised border border-rim rounded px-2 py-1 text-xs text-chalk placeholder:text-ash focus:outline-none focus:border-neon"
              />
            </div>
            <div className="overflow-y-auto flex-1">
              <button
                className="w-full text-left px-3 py-1.5 text-sm text-ash hover:bg-raised transition-colors cursor-pointer"
                onClick={() => select('')}
              >
                — select —
              </button>
              {filtered.map((a) => (
                <button
                  key={a.id}
                  className={`w-full text-left px-3 py-1.5 text-sm flex items-center gap-2 hover:bg-raised transition-colors cursor-pointer ${
                    a.id === value ? 'text-neon' : 'text-chalk'
                  }`}
                  onClick={() => select(a.id)}
                >
                  <span className="text-ash text-xs font-mono w-12 shrink-0">{a.number}</span>
                  <span className="truncate">{a.name}</span>
                </button>
              ))}
              {filtered.length === 0 && (
                <p className="px-3 py-3 text-xs text-ash">No accounts match.</p>
              )}
            </div>
          </div>,
          document.body,
        )}
    </>
  )
}
