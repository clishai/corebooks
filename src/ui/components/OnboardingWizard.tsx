import { useState } from 'react'
import {
  BusinessType,
  FeatureFlags,
  saveBusinessType,
  saveFeatureFlags,
} from '../lib/featureFlags'

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

function ComingSoonBadge() {
  return (
    <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold bg-violet/10 text-violet border border-violet/30 ml-2">
      coming soon
    </span>
  )
}

export default function OnboardingWizard({ onDismiss }: Props) {
  const [step, setStep] = useState<Step>('name')
  const [companyName, setCompanyName] = useState(() => localStorage.getItem(COMPANY_NAME_KEY) ?? '')
  const [businessType, setBusinessType] = useState<BusinessType | null>(null)
  const [flags, setFlags] = useState<FeatureFlags>({ ar_ap: false, inventory: false })

  const stepNum = step === 'name' ? 1 : step === 'type' ? 2 : 3

  function handleNameNext() {
    setStep('type')
  }

  function handleTypeNext() {
    // Pre-select recommended modules based on business type
    setFlags({
      ar_ap:
        businessType === 'service' ||
        businessType === 'product' ||
        businessType === 'nonprofit',
      inventory: businessType === 'product',
    })
    setStep('modules')
  }

  function toggleFlag(key: keyof FeatureFlags) {
    setFlags((f) => ({ ...f, [key]: !f[key] }))
  }

  function finish() {
    const name = companyName.trim()
    if (name) localStorage.setItem(COMPANY_NAME_KEY, name)
    if (businessType) saveBusinessType(businessType)
    saveFeatureFlags(flags)
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

          {/* ── Step 3: Optional modules ── */}
          {step === 'modules' && (
            <>
              <h2 className="text-lg font-bold text-chalk lowercase">optional modules</h2>
              <p className="text-sm text-ash">
                Enable modules you plan to use. Disabled modules are hidden from the sidebar.
                You can change these in Settings at any time.
              </p>

              <div className="bg-void border border-rim rounded-lg divide-y divide-rim">
                {/* AR/AP */}
                <label
                  onClick={() => toggleFlag('ar_ap')}
                  className="flex items-start gap-4 px-5 py-4 cursor-pointer hover:bg-surface transition-colors"
                >
                  <div
                    className={`mt-0.5 w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors ${
                      flags.ar_ap ? 'bg-neon border-neon' : 'border-rim bg-base'
                    }`}
                  >
                    {flags.ar_ap && (
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
                  <div>
                    <p className="text-sm font-medium text-chalk">
                      AR / AP Manager
                      <ComingSoonBadge />
                    </p>
                    <p className="text-xs text-ash mt-0.5">
                      Track invoices, customer payments, and vendor bills. Great for businesses
                      that send or receive invoices.
                    </p>
                  </div>
                </label>

                {/* Inventory */}
                <label
                  onClick={() => toggleFlag('inventory')}
                  className="flex items-start gap-4 px-5 py-4 cursor-pointer hover:bg-surface transition-colors"
                >
                  <div
                    className={`mt-0.5 w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors ${
                      flags.inventory ? 'bg-neon border-neon' : 'border-rim bg-base'
                    }`}
                  >
                    {flags.inventory && (
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
                  <div>
                    <p className="text-sm font-medium text-chalk">
                      Inventory
                      <ComingSoonBadge />
                    </p>
                    <p className="text-xs text-ash mt-0.5">
                      Track physical goods, quantities on hand, and cost of goods sold.
                      For businesses that sell products.
                    </p>
                  </div>
                </label>
              </div>
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
              onClick={finish}
              className="bg-neon hover:bg-neon-dim text-void text-sm font-bold px-6 py-2.5 rounded-md transition-colors"
            >
              Finish ✓
            </button>
          )}
        </div>

      </div>
    </div>
  )
}
