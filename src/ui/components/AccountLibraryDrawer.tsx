import { useState, useRef } from 'react'
import { createPortal } from 'react-dom'
import { ACCOUNT_TEMPLATES, type AccountTemplate } from '../lib/accountTemplates'
import { api } from '../api/client'

interface Props {
  existingNumbers: Set<string>
  onClose: () => void
  onAdded: () => void
}

const GROUPS: Array<{ label: string; type: AccountTemplate['type'] }> = [
  { label: 'Assets', type: 'Asset' },
  { label: 'Liabilities', type: 'Liability' },
  { label: 'Equity', type: 'Equity' },
  { label: 'Revenue', type: 'Revenue' },
  { label: 'Expenses', type: 'Expense' },
]

// Tooltip that escapes the drawer's overflow-y-auto by rendering into document.body.
// Opens to the LEFT of the ? button so it stays within the visible viewport.
function InfoTooltip({ text }: { text: string }) {
  const [rect, setRect] = useState<DOMRect | null>(null)
  const btnRef = useRef<HTMLButtonElement>(null)

  return (
    <>
      <button
        ref={btnRef}
        onMouseEnter={() => setRect(btnRef.current?.getBoundingClientRect() ?? null)}
        onMouseLeave={() => setRect(null)}
        tabIndex={-1}
        className="w-4 h-4 flex items-center justify-center rounded-full border border-ash/25 text-ash/40 hover:border-ash/60 hover:text-ash transition-colors cursor-default text-[10px] leading-none shrink-0"
        aria-label="More info"
      >
        ?
      </button>
      {rect && createPortal(
        <div
          style={{
            position: 'fixed',
            top: rect.top + rect.height / 2,
            right: window.innerWidth - rect.left + 10,
            transform: 'translateY(-50%)',
          }}
          className="max-w-[260px] bg-raised border border-rim rounded-md px-3 py-2.5 text-xs text-ash leading-relaxed pointer-events-none z-[9999] shadow-xl"
        >
          {text}
        </div>,
        document.body,
      )}
    </>
  )
}

export default function AccountLibraryDrawer({ existingNumbers, onClose, onAdded }: Props) {
  const [adding, setAdding] = useState<Set<string>>(new Set())
  const [added, setAdded] = useState<Set<string>>(new Set())

  async function handleAdd(template: AccountTemplate) {
    setAdding((prev) => new Set(prev).add(template.number))
    try {
      await api.accounts.create({
        number: template.number,
        name: template.name,
        type: template.type,
        normalBalance: template.normalBalance,
        isContra: template.isContra,
        contraTo: template.contraTo,
        classification: template.classification,
      })
      setAdded((prev) => new Set(prev).add(template.number))
      onAdded()
    } finally {
      setAdding((prev) => {
        const next = new Set(prev)
        next.delete(template.number)
        return next
      })
    }
  }

  async function handleAddAll(type: AccountTemplate['type']) {
    const templates = ACCOUNT_TEMPLATES.filter(
      (t) => t.type === type && !existingNumbers.has(t.number) && !added.has(t.number)
    )
    for (const t of templates) await handleAdd(t)
  }

  return createPortal(
    <div className="fixed inset-0 bg-black/60 z-50 flex justify-end" onClick={onClose}>
      <div
        className="w-[440px] bg-void border-l border-rim flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-rim shrink-0">
          <div>
            <h2 className="text-chalk font-semibold text-sm">Account Library</h2>
            <p className="text-ash text-[11px] mt-0.5">
              {ACCOUNT_TEMPLATES.length} standard accounts — hover <span className="border border-ash/30 rounded-full px-1 text-[9px]">?</span> for details
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded text-ash hover:text-chalk hover:bg-surface transition-colors cursor-pointer text-base"
          >
            ✕
          </button>
        </div>

        {/* Scrollable list */}
        <div className="flex-1 overflow-y-auto">
          {GROUPS.map(({ label, type }) => {
            const templates = ACCOUNT_TEMPLATES.filter((t) => t.type === type)
            const availableCount = templates.filter(
              (t) => !existingNumbers.has(t.number) && !added.has(t.number)
            ).length

            return (
              <div key={type}>
                {/* Group header */}
                <div className="flex items-center justify-between px-5 py-2.5 bg-base/80 sticky top-0 border-b border-rim/50">
                  <span className="text-neon text-[10px] font-semibold uppercase tracking-widest">
                    {label}
                  </span>
                  {availableCount > 0 && (
                    <button
                      onClick={() => handleAddAll(type)}
                      className="text-ash hover:text-neon text-[10px] uppercase tracking-wide transition-colors cursor-pointer"
                    >
                      Add all ({availableCount})
                    </button>
                  )}
                </div>

                {/* Rows */}
                {templates.map((t) => {
                  const alreadyExists = existingNumbers.has(t.number) || added.has(t.number)
                  const isAdding = adding.has(t.number)

                  return (
                    <div
                      key={t.number}
                      className="flex items-center gap-3 px-4 py-2.5 border-b border-rim/20 hover:bg-surface/60 transition-colors"
                    >
                      {/* Account number */}
                      <span className="text-ash text-[11px] font-mono w-10 shrink-0 tabular-nums">
                        {t.number}
                      </span>

                      {/* Name + badges */}
                      <div className="flex-1 flex items-center gap-1.5 min-w-0">
                        <span className={`text-xs truncate ${alreadyExists ? 'text-ash/60' : 'text-chalk'}`}>
                          {t.name}
                        </span>
                        {t.isContra && (
                          <span className="text-violet text-[9px] font-medium shrink-0 border border-violet/30 rounded px-1 py-px">
                            contra
                          </span>
                        )}
                      </div>

                      {/* Info tooltip */}
                      <InfoTooltip text={t.description} />

                      {/* Add button */}
                      <button
                        onClick={() => !alreadyExists && !isAdding && handleAdd(t)}
                        disabled={alreadyExists || isAdding}
                        className={`text-[10px] font-semibold shrink-0 w-14 py-1 rounded border transition-colors ${
                          alreadyExists
                            ? 'border-rim/40 text-ash/40 cursor-default'
                            : isAdding
                            ? 'border-neon/40 text-neon/40 cursor-default'
                            : 'border-neon text-neon hover:bg-neon hover:text-void cursor-pointer'
                        }`}
                      >
                        {alreadyExists ? '✓ Added' : isAdding ? '…' : 'ADD+'}
                      </button>
                    </div>
                  )
                })}
              </div>
            )
          })}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-rim shrink-0">
          <p className="text-ash text-[11px]">All accounts are fully editable after adding.</p>
        </div>
      </div>
    </div>,
    document.body,
  )
}
