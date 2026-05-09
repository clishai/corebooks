import { useNavigate } from 'react-router-dom'
import type { OllamaConfig } from '../lib/ollama'

interface Props {
  config: OllamaConfig
  ollamaConnected: boolean | null
  onClose: () => void
}

export default function AIPanel({ config, ollamaConnected, onClose }: Props) {
  const navigate = useNavigate()

  return (
    <aside className="w-80 shrink-0 border-l border-rim bg-void flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-rim shrink-0">
        <span className="text-sm font-medium text-chalk">AI (Beta)</span>
        <button
          onClick={onClose}
          className="text-ash hover:text-chalk transition-colors text-base leading-none cursor-pointer"
        >
          ✕
        </button>
      </div>

      {/* Connection status */}
      <div className="px-4 py-3 border-b border-rim shrink-0">
        {ollamaConnected === null ? (
          <span className="text-xs text-ash">Checking connection…</span>
        ) : ollamaConnected ? (
          <div className="space-y-0.5">
            <div className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
              <span className="text-xs text-emerald-300">Ollama connected</span>
            </div>
            {config.model && (
              <p className="text-xs text-ash pl-3.5">{config.model}</p>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-red-400 shrink-0" />
            <span className="text-xs text-red-300">Ollama not connected</span>
          </div>
        )}
      </div>

      {/* Body */}
      <div className="flex-1 px-4 py-4 space-y-4 overflow-y-auto">
        <div className="bg-surface border border-rim rounded-lg px-4 py-4 space-y-2">
          <p className="text-xs text-ash leading-relaxed">
            Transaction categorisation and journal suggestions are coming with bank feed import.
          </p>
          <p className="text-xs text-ash/60 leading-relaxed">
            AI features observe and suggest — they never post entries without your review.
          </p>
        </div>
      </div>

      {/* Footer */}
      <div className="px-4 py-3 border-t border-rim shrink-0">
        <button
          onClick={() => navigate('/settings?tab=ai')}
          className="text-xs text-ash hover:text-neon transition-colors cursor-pointer"
        >
          Configure AI →
        </button>
      </div>
    </aside>
  )
}
