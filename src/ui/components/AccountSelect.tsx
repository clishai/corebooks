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
  const [activeIdx, setActiveIdx] = useState(0)
  const [pos, setPos] = useState({ top: 0, left: 0, width: 0 })
  const triggerRef = useRef<HTMLButtonElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const activeItemRef = useRef<HTMLButtonElement>(null)

  const selected = accounts.find((a) => a.id === value)

  const filtered = search.trim()
    ? accounts.filter(
        (a) =>
          a.name.toLowerCase().includes(search.toLowerCase()) ||
          a.number.toLowerCase().includes(search.toLowerCase()),
      )
    : accounts

  useEffect(() => { setActiveIdx(0) }, [search])

  useEffect(() => {
    activeItemRef.current?.scrollIntoView({ block: 'nearest' })
  }, [activeIdx])

  function openDropdown() {
    if (!triggerRef.current) return
    const rect = triggerRef.current.getBoundingClientRect()
    setPos({ top: rect.bottom + 2, left: rect.left, width: rect.width })
    setSearch('')
    setActiveIdx(0)
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
      if (dropdownRef.current?.contains(e.target as Node)) return
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

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') { setOpen(false); setSearch(''); return }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIdx((i) => Math.min(i + 1, filtered.length - 1))
      return
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIdx((i) => Math.max(i - 1, 0))
      return
    }
    if (e.key === 'Enter' && filtered[activeIdx]) {
      select(filtered[activeIdx].id)
    }
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
            ref={dropdownRef}
            style={{ top: pos.top, left: pos.left, width: Math.max(pos.width, 260) }}
            className="fixed z-[9999] bg-surface border border-rim rounded shadow-2xl flex flex-col max-h-60"
          >
            <div className="p-2 border-b border-rim shrink-0">
              <input
                ref={searchRef}
                placeholder="Search accounts…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={handleKeyDown}
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
              {filtered.map((a, i) => (
                <button
                  key={a.id}
                  ref={i === activeIdx ? activeItemRef : null}
                  onMouseEnter={() => setActiveIdx(i)}
                  onClick={() => select(a.id)}
                  className={`w-full text-left px-3 py-1.5 text-sm flex items-center gap-2 transition-colors cursor-pointer ${
                    i === activeIdx
                      ? 'bg-raised text-neon'
                      : a.id === value
                        ? 'text-neon hover:bg-raised'
                        : 'text-chalk hover:bg-raised'
                  }`}
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
