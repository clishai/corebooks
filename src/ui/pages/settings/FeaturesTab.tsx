import { useState, useEffect } from 'react'
import {
  FEATURE_REGISTRY,
  isFeatureActive,
  enableFeature,
  hideFeature,
  type FeatureDef,
  type FeatureTier,
} from '../../lib/features'

interface CardProps {
  def: FeatureDef
  onAction: () => void
}

function FeatureCard({ def, onAction }: CardProps) {
  const active = isFeatureActive(def.id)
  const isCore = def.tier === 'core'

  function handleEnable() {
    enableFeature(def.id)
    window.dispatchEvent(new CustomEvent('cb:feature-state-changed'))
    onAction()
  }

  function handleHide() {
    hideFeature(def.id)
    window.dispatchEvent(new CustomEvent('cb:feature-state-changed'))
    onAction()
  }

  return (
    <div className={`bg-surface border border-rim rounded-sm p-4 flex flex-col gap-3 ${isCore ? 'opacity-60' : ''}`}>
      <div>
        <p className="text-sm font-semibold text-chalk">{def.name}</p>
        <p className="text-xs text-ash mt-1 leading-relaxed">{def.description}</p>
      </div>
      <div className="flex items-center gap-2 mt-auto">
        {isCore && (
          <span className="text-[10px] text-ash border border-rim rounded px-2 py-0.5 uppercase tracking-wider">
            Always on
          </span>
        )}
        {!isCore && active && (
          <>
            <span className="text-[10px] text-green-400 border border-green-800 rounded px-2 py-0.5 uppercase tracking-wider">
              Enabled
            </span>
            <button
              onClick={handleHide}
              className="text-xs text-ash hover:text-chalk border border-rim rounded px-2 py-0.5 transition-colors cursor-pointer"
            >
              Hide
            </button>
          </>
        )}
        {!isCore && !active && (
          <button
            onClick={handleEnable}
            className="text-xs text-neon border border-neon/40 hover:bg-neon/10 rounded px-2 py-0.5 transition-colors cursor-pointer"
          >
            Add
          </button>
        )}
      </div>
    </div>
  )
}

const TIERS: { tier: FeatureTier; label: string; sublabel: string }[] = [
  { tier: 'core', label: 'Core', sublabel: 'Always on. Cannot be hidden.' },
  { tier: 'workflow', label: 'Workflows', sublabel: 'Optional features for common accounting workflows.' },
  { tier: 'module', label: 'Modules', sublabel: 'Optional modules that extend the ledger.' },
]

export default function FeaturesTab() {
  const [, setVersion] = useState(0)

  useEffect(() => {
    function handler() { setVersion((v) => v + 1) }
    window.addEventListener('cb:feature-state-changed', handler)
    return () => window.removeEventListener('cb:feature-state-changed', handler)
  }, [])

  function forceRefresh() { setVersion((v) => v + 1) }

  return (
    <div className="space-y-8">
      {TIERS.map(({ tier, label, sublabel }) => {
        const features = FEATURE_REGISTRY.filter((f) => f.tier === tier)
        return (
          <div key={tier}>
            <div className="mb-4">
              <h3 className="text-sm font-semibold text-chalk">{label}</h3>
              <p className="text-xs text-ash mt-0.5">{sublabel}</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {features.map((def) => (
                <FeatureCard key={def.id} def={def} onAction={forceRefresh} />
              ))}
            </div>
          </div>
        )
      })}

      <div className="bg-surface border border-rim rounded-sm px-4 py-3">
        <p className="text-xs text-ash leading-relaxed">
          <strong className="text-chalk">Hiding a feature</strong> removes it from the sidebar. All data is preserved
          and can be restored by clicking <strong className="text-chalk">Add</strong> again.
        </p>
      </div>
    </div>
  )
}
