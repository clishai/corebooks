import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'

interface Props {
  value: string  // YYYY-MM-DD
  onChange: (value: string) => void
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]
const DAY_LABELS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']

function parseDate(iso: string): Date {
  return new Date(iso + 'T00:00:00')
}

function toISO(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function displayLabel(iso: string): string {
  if (!iso) return 'Select date'
  return parseDate(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

export default function DatePicker({ value, onChange }: Props) {
  const initial = value ? parseDate(value) : new Date()
  const [open, setOpen] = useState(false)
  const [view, setView] = useState({ year: initial.getFullYear(), month: initial.getMonth() })
  const [pos, setPos] = useState({ top: 0, left: 0 })
  const triggerRef = useRef<HTMLButtonElement>(null)

  function openPicker() {
    if (!triggerRef.current) return
    const rect = triggerRef.current.getBoundingClientRect()
    setPos({ top: rect.bottom + 4, left: rect.left })
    const d = value ? parseDate(value) : new Date()
    setView({ year: d.getFullYear(), month: d.getMonth() })
    setOpen(true)
  }

  useEffect(() => {
    if (!open) return
    function handlePointerDown(e: PointerEvent) {
      if (triggerRef.current?.contains(e.target as Node)) return
      setOpen(false)
    }
    document.addEventListener('pointerdown', handlePointerDown)
    return () => document.removeEventListener('pointerdown', handlePointerDown)
  }, [open])

  function prevMonth() {
    setView((v) =>
      v.month === 0 ? { year: v.year - 1, month: 11 } : { ...v, month: v.month - 1 },
    )
  }

  function nextMonth() {
    setView((v) =>
      v.month === 11 ? { year: v.year + 1, month: 0 } : { ...v, month: v.month + 1 },
    )
  }

  function selectDay(day: number) {
    onChange(toISO(view.year, view.month, day))
    setOpen(false)
  }

  const firstWeekday = new Date(view.year, view.month, 1).getDay()
  const daysInMonth = new Date(view.year, view.month + 1, 0).getDate()
  const cells: (number | null)[] = [
    ...Array<null>(firstWeekday).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ]
  while (cells.length % 7 !== 0) cells.push(null)

  const todayISO = new Date().toISOString().slice(0, 10)

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={openPicker}
        className="w-full bg-raised border border-rim text-chalk rounded px-2 py-1.5 text-sm text-left flex items-center justify-between gap-2 focus:outline-none focus:ring-2 focus:ring-neon cursor-pointer"
      >
        <span className={value ? 'text-chalk' : 'text-ash'}>{displayLabel(value)}</span>
        <span className="text-ash text-xs shrink-0">▾</span>
      </button>

      {open &&
        createPortal(
          <div
            style={{ top: pos.top, left: pos.left }}
            className="fixed z-[9999] bg-surface border border-rim rounded shadow-2xl p-3 w-64"
            onPointerDown={(e) => e.stopPropagation()}
          >
            {/* Month / year nav */}
            <div className="flex items-center justify-between mb-3">
              <button
                onClick={prevMonth}
                className="text-ash hover:text-chalk px-2 py-1 rounded hover:bg-raised text-sm transition-colors cursor-pointer"
              >
                ‹
              </button>
              <span className="text-chalk text-sm font-medium select-none">
                {MONTH_NAMES[view.month]} {view.year}
              </span>
              <button
                onClick={nextMonth}
                className="text-ash hover:text-chalk px-2 py-1 rounded hover:bg-raised text-sm transition-colors cursor-pointer"
              >
                ›
              </button>
            </div>

            {/* Day-of-week headers */}
            <div className="grid grid-cols-7 mb-1">
              {DAY_LABELS.map((d) => (
                <div key={d} className="text-center text-[10px] font-semibold text-ash py-1 select-none">
                  {d}
                </div>
              ))}
            </div>

            {/* Day cells */}
            <div className="grid grid-cols-7 gap-0.5">
              {cells.map((day, idx) => {
                if (!day) return <div key={idx} />
                const iso = toISO(view.year, view.month, day)
                const isSelected = iso === value
                const isToday = iso === todayISO
                return (
                  <button
                    key={idx}
                    onClick={() => selectDay(day)}
                    className={`text-center text-xs py-1.5 rounded transition-colors cursor-pointer ${
                      isSelected
                        ? 'bg-neon text-void font-bold'
                        : isToday
                          ? 'border border-neon/50 text-neon hover:bg-raised'
                          : 'text-chalk hover:bg-raised'
                    }`}
                  >
                    {day}
                  </button>
                )
              })}
            </div>
          </div>,
          document.body,
        )}
    </>
  )
}
