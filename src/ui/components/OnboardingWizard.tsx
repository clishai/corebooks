import { useState } from 'react'
import {
  BusinessType,
  saveBusinessType,
  saveFeatureFlags,
} from '../lib/featureFlags'
import { getTemplatesForBusinessType, type AccountTemplate } from '../lib/accountTemplates'
import { api } from '../api/client'

const WELCOMED_KEY = 'cb_welcomed'
export const COMPANY_NAME_KEY = 'cb_company_name'

export function shouldShowOnboarding(): boolean {
  return !localStorage.getItem(WELCOMED_KEY)
}

export function getCompanyName(): string {
  return localStorage.getItem(COMPANY_NAME_KEY) ?? 'corebooks'
}

interface Props {
  onDismiss: () => void
}

type Step = 'name' | 'type' | 'modules'

const BUSINESS_TYPES: { value: BusinessType; label: string; description: string }[] = [
  {
    value: 'freelancer',
    label: 'Freelancer / Sole proprietor',
    description: 'Independent contractor, consultant, or self-employed individual.',
  },
  {
    value: 'service',
    label: 'Service business',
    description: 'Agency, professional services, or any business that sells time or expertise.',
  },
  {
    value: 'product',
    label: 'Product business',
    description: 'Sells physical or digital goods. Inventory tracking may apply.',
  },
  {
    value: 'nonprofit',
    label: 'Nonprofit / Organization',
    description: 'Charity, association, or other non-commercial entity.',
  },
  { value: 'other', label: 'Other', description: 'Something else entirely.' },
]

const inputClass =
  'w-full bg-base border border-rim rounded-md px-3 py-2 text-chalk placeholder:text-ash focus:outline-none focus:border-neon text-sm'

export default function OnboardingWizard({ onDismiss }: Props) {
  const [step, setStep] = useState<Step>('name')
  const [companyName, setCompanyName] = useState(() => localStorage.getItem(COMPANY_NAME_KEY) ?? '')
  const [businessType, setBusinessType] = useState<BusinessType | null>(null)
  const [selectedTemplates, setSelectedTemplates] = useState<Set<string>>(new Set())
  const [addingTemplates, setAddingTemplates] = useState(false)

  const stepNum = step === 'name' ? 1 : step === 'type' ? 2 : 3

  function handleNameNext() {
    setStep('type')
  }

  function handleTypeNext() {
    setSelectedTemplates(new Set())
    setStep('modules')
  }

  function toggleTemplate(number: string) {
    setSelectedTemplates((prev) => {
      const next = new Set(prev)
      next.has(number) ? next.delete(number) : next.add(number)
      return next
    })
  }

  async function handleAddSelected(suggestedTemplates: AccountTemplate[]) {
    setAddingTemplates(true)
    for (const t of suggestedTemplates.filter((t) => selectedTemplates.has(t.number))) {
      try {
        await api.accounts.create({
          number: t.number,
          name: t.name,
          type: t.type,
          normalBalance: t.normalBalance,
          isContra: t.isContra,
          contraTo: t.contraTo,
          classification: t.classification,
        })
      } catch {
        // skip existing
      }
    }
    setAddingTemplates(false)
  }

  async function finish(suggestedTemplates: AccountTemplate[]) {
    await handleAddSelected(suggestedTemplates)
    const name = companyName.trim()
    if (name) localStorage.setItem(COMPANY_NAME_KEY, name)
    if (businessType) saveBusinessType(businessType)
    saveFeatureFlags({ ar_ap: false, inventory: false })
    localStorage.setItem(WELCOMED_KEY, '1')
    onDismiss()
  }

  // Saves whatever has been filled in so far and applies defaults for the rest.
  function skip() {
    const name = companyName.trim()
    if (name) localStorage.setItem(COMPANY_NAME_KEY, name)
    saveFeatureFlags({ ar_ap: false, inventory: false })
    localStorage.setItem(WELCOMED_KEY, '1')
    onDismiss()
  }

  const suggestedTemplates = getTemplatesForBusinessType(businessType ?? 'other').slice(0, 12)

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-surface border border-rim rounded-xl shadow-2xl w-full max-w-lg flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-7 pt-6 pb-0">
          <span className="text-xs text-ash font-medium tabular-nums">step {stepNum} of 3</span>
          <button
            onClick={skip}
            className="text-xs text-ash hover:text-chalk transition-colors"
          >
            Skip setup →
          </button>
        </div>

        {/* Body */}
        <div className="px-7 py-6 space-y-5">

          {/* ── Step 1: Company name ── */}
          {step === 'name' && (
            <>
              <h2 className="text-lg font-bold text-chalk lowercase">welcome to corebooks</h2>

              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-chalk" htmlFor="company-name">
                  What&apos;s your company name?
                </label>
                <input
                  id="company-name"
                  type="text"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleNameNext() }}
                  placeholder="e.g. Acme Corp"
                  className={inputClass}
                  autoFocus
                />
                <p className="text-xs text-ash">
                  This appears in the top bar. You can change it later in Settings.
                </p>
              </div>

              <div className="bg-raised border border-rim rounded-lg px-4 py-4 space-y-3 text-sm text-ash leading-relaxed">
                <p>
                  Your financial data is stored{' '}
                  <strong className="text-chalk">right here on your computer</strong>. No cloud,
                  no subscription, no account required — ever.
                </p>
                <p>
                  Need multiple people on different computers? A guided setup is available in{' '}
                  <strong className="text-chalk">Settings → Database</strong> when you&apos;re
                  ready.
                </p>
              </div>
            </>
          )}

          {/* ── Step 2: Business type ── */}
          {step === 'type' && (
            <>
              <h2 className="text-lg font-bold text-chalk lowercase">what kind of business?</h2>
              <p className="text-sm text-ash">
                We&apos;ll suggest the right modules for you. You can change this later.
              </p>

              <div className="bg-void border border-rim rounded-lg divide-y divide-rim">
                {BUSINESS_TYPES.map((bt) => (
                  <label
                    key={bt.value}
                    onClick={() => setBusinessType(bt.value)}
                    className="flex items-start gap-4 px-5 py-3.5 cursor-pointer hover:bg-surface transition-colors"
                  >
                    <div className="mt-0.5 w-4 h-4 rounded-full border flex items-center justify-center shrink-0 transition-colors border-rim">
                      {businessType === bt.value && (
                        <div className="w-2 h-2 rounded-full bg-neon" />
                      )}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-chalk">{bt.label}</p>
                      <p className="text-xs text-ash mt-0.5">{bt.description}</p>
                    </div>
                  </label>
                ))}
              </div>
            </>
          )}

          {/* ── Step 3: Account template suggestions ── */}
          {step === 'modules' && (
            <>
              <h2 className="text-lg font-bold text-chalk lowercase">starter accounts</h2>
              <p className="text-sm text-ash">
                Select accounts to add to your chart of accounts. You can add more at any time
                from the Account Library in Settings.
              </p>

              <div className="bg-void border border-rim rounded-lg divide-y divide-rim max-h-64 overflow-y-auto">
                {suggestedTemplates.map((t) => {
                  const checked = selectedTemplates.has(t.number)
                  return (
                    <label
                      key={t.number}
                      onClick={() => toggleTemplate(t.number)}
                      className="flex items-start gap-4 px-5 py-3 cursor-pointer hover:bg-surface transition-colors"
                    >
                      <div
                        className={`mt-0.5 w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors ${
                          checked ? 'bg-neon border-neon' : 'border-rim bg-base'
                        }`}
                      >
                        {checked && (
                          <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                            <path
                              d="M1 4L3.5 6.5L9 1"
                              stroke="#0a0c12"
                              strokeWidth="1.8"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-ash text-xs font-mono">{t.number}</span>
                          <span className="text-sm font-medium text-chalk truncate">{t.name}</span>
                          {t.isContra && <span className="text-violet text-[10px]">contra</span>}
                        </div>
                        <p className="text-xs text-ash mt-0.5 line-clamp-1">{t.description}</p>
                      </div>
                    </label>
                  )
                })}
              </div>

              {suggestedTemplates.length === 0 && (
                <p className="text-sm text-ash">
                  No template suggestions for this business type. You can add accounts manually
                  from the chart of accounts.
                </p>
              )}
            </>
          )}

        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-7 pb-7">
          {step !== 'name' ? (
            <button
              onClick={() => setStep(step === 'modules' ? 'type' : 'name')}
              className="text-sm text-ash hover:text-chalk transition-colors"
            >
              ← Back
            </button>
          ) : (
            <span />
          )}

          {step === 'name' && (
            <button
              onClick={handleNameNext}
              className="bg-neon hover:bg-neon-dim text-void text-sm font-bold px-6 py-2.5 rounded-md transition-colors"
            >
              Next →
            </button>
          )}
          {step === 'type' && (
            <button
              onClick={handleTypeNext}
              className="bg-neon hover:bg-neon-dim text-void text-sm font-bold px-6 py-2.5 rounded-md transition-colors"
            >
              Next →
            </button>
          )}
          {step === 'modules' && (
            <button
              onClick={() => finish(suggestedTemplates)}
              disabled={addingTemplates}
              className="bg-neon hover:bg-neon-dim disabled:opacity-50 text-void text-sm font-bold px-6 py-2.5 rounded-md transition-colors"
            >
              {addingTemplates
                ? 'Adding accounts…'
                : selectedTemplates.size > 0
                  ? `Add ${selectedTemplates.size} & Finish`
                  : 'Finish ✓'}
            </button>
          )}
        </div>

      </div>
    </div>
  )
}
