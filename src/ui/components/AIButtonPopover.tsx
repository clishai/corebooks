import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'

interface Props {
  aiEnabled: boolean
  ollamaConnected: boolean | null
  panelOpen: boolean
  onTogglePanel: () => void
  onActivate: () => Promise<boolean>
}

export default function AIButtonPopover({
  aiEnabled,
  ollamaConnected,
  panelOpen,
  onTogglePanel,
  onActivate,
}: Props) {
  const [popoverOpen, setPopoverOpen] = useState(false)
  const [activating, setActivating] = useState(false)
  const [activateFailed, setActivateFailed] = useState(false)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setPopoverOpen(false)
        setActivateFailed(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const dotColor = !aiEnabled
    ? null
    : ollamaConnected === true
      ? 'bg-neon'
      : 'bg-red-400'

  function handleButtonClick() {
    if (aiEnabled && ollamaConnected === true) {
      onTogglePanel()
      setPopoverOpen(false)
    } else {
      setPopoverOpen((prev) => !prev)
      setActivateFailed(false)
    }
  }

  async function handleActivate() {
    setActivating(true)
    setActivateFailed(false)
    try {
      const connected = await onActivate()
      if (connected) {
        setPopoverOpen(false)
        onTogglePanel()
      } else {
        setActivateFailed(true)
      }
    } catch {
      setActivateFailed(true)
    } finally {
      setActivating(false)
    }
  }

  const buttonOpenClass = 'flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-surface text-chalk border border-rim border-b-0 rounded-t-sm w-full cursor-pointer transition-colors'
  const buttonClosedClass = 'flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-rim text-ash hover:text-chalk rounded-sm transition-colors cursor-pointer'

  const isOpen = popoverOpen && !panelOpen

  return (
    <div ref={wrapperRef} className="relative">
      <button
        onClick={handleButtonClick}
        className={isOpen ? buttonOpenClass : buttonClosedClass}
      >
        {dotColor && (
          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dotColor}`} />
        )}
        AI (Beta)
      </button>

      {isOpen && (
        <div
          className="absolute top-full right-0 bg-surface border border-rim border-t-0 rounded-b-sm w-60 px-4 py-4 space-y-3 z-50 shadow-2xl animate-fade-in"
        >
          {!aiEnabled ? (
            <>
              <p className="text-sm text-ash leading-snug">AI features are not currently enabled.</p>
              <button
                onClick={() => { setPopoverOpen(false); navigate('/settings?tab=ai') }}
                className="text-xs px-3 py-1.5 rounded border border-neon/40 text-neon hover:bg-neon/10 transition-colors cursor-pointer"
              >
                Settings →
              </button>
            </>
          ) : activateFailed ? (
            <>
              <p className="text-sm text-ash leading-snug">Couldn't start Ollama — check your setup.</p>
              <button
                onClick={() => { setPopoverOpen(false); navigate('/settings?tab=ai') }}
                className="text-xs px-3 py-1.5 rounded border border-neon/40 text-neon hover:bg-neon/10 transition-colors cursor-pointer"
              >
                Settings →
              </button>
            </>
          ) : (
            <>
              <p className="text-sm text-ash leading-snug">AI is not currently activated.</p>
              <button
                onClick={() => void handleActivate()}
                disabled={activating}
                className="text-xs px-3 py-1.5 rounded border border-neon/40 text-neon hover:bg-neon/10 disabled:opacity-50 transition-colors cursor-pointer"
              >
                {activating ? 'Starting…' : 'Activate'}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}
