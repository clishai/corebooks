import { useState } from 'react'
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

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex justify-end" onClick={onClose}>
      <div
        className="w-96 h-full bg-void border-l border-rim overflow-y-auto flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-rim shrink-0">
          <h2 className="text-chalk font-semibold text-sm">Account Library</h2>
          <button onClick={onClose} className="text-ash hover:text-chalk text-sm transition-colors">
            ✕
          </button>
        </div>
        <p className="text-ash text-xs px-5 py-3 border-b border-rim">
          Click ADD+ to add an account. All accounts are editable after adding.
        </p>
        <div className="flex-1 overflow-y-auto">
          {GROUPS.map(({ label, type }) => {
            const templates = ACCOUNT_TEMPLATES.filter((t) => t.type === type)
            return (
              <div key={type}>
                <div className="flex items-center justify-between px-5 py-2 bg-base sticky top-0">
                  <span className="text-neon text-[10px] font-semibold uppercase tracking-widest">
                    {label}
                  </span>
                  <button
                    onClick={() => handleAddAll(type)}
                    className="text-ash hover:text-neon text-[10px] uppercase tracking-wide transition-colors"
                  >
                    Add All
                  </button>
                </div>
                {templates.map((t) => {
                  const alreadyExists = existingNumbers.has(t.number) || added.has(t.number)
                  const isAdding = adding.has(t.number)
                  return (
                    <div
                      key={t.number}
                      className="flex items-start justify-between px-5 py-2.5 border-b border-rim/30 hover:bg-surface group"
                    >
                      <div className="flex-1 min-w-0 mr-3">
                        <div className="flex items-center gap-2">
                          <span className="text-ash text-xs font-mono">{t.number}</span>
                          <span className="text-chalk text-xs truncate">{t.name}</span>
                          {t.isContra && <span className="text-violet text-[10px]">contra</span>}
                        </div>
                        <p className="text-ash text-[10px] mt-0.5 line-clamp-1">{t.description}</p>
                      </div>
                      <button
                        onClick={() => !alreadyExists && handleAdd(t)}
                        disabled={alreadyExists || isAdding}
                        className={`text-[10px] font-semibold shrink-0 px-2 py-1 rounded-sm border transition-colors ${
                          alreadyExists
                            ? 'border-rim text-ash cursor-default'
                            : 'border-neon text-neon hover:bg-neon hover:text-void'
                        }`}
                      >
                        {alreadyExists ? 'Added' : isAdding ? '…' : 'ADD+'}
                      </button>
                    </div>
                  )
                })}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
