import { useEffect, useState } from 'react'

interface Action {
  label: string
  onClick: () => void
  variant?: 'primary' | 'ghost'
}

interface Props {
  message: string
  actions?: Action[]
  onDismiss: () => void
  durationMs?: number
}

export default function ActionToast({ message, actions = [], onDismiss, durationMs }: Props) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const enter = requestAnimationFrame(() => setVisible(true))
    let dismiss: ReturnType<typeof setTimeout> | null = null
    if (durationMs !== undefined) {
      dismiss = setTimeout(() => {
        setVisible(false)
        setTimeout(onDismiss, 300)
      }, durationMs)
    }
    return () => {
      cancelAnimationFrame(enter)
      if (dismiss !== null) clearTimeout(dismiss)
    }
  }, [onDismiss, durationMs])

  function handleAction(action: Action) {
    action.onClick()
    setVisible(false)
    setTimeout(onDismiss, 300)
  }

  return (
    <div
      className={`fixed bottom-5 right-5 z-50 flex flex-col gap-3 bg-raised border border-rim text-chalk text-sm px-4 py-3 rounded-lg shadow-lg transition-all duration-300 max-w-xs ${
        visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'
      }`}
    >
      <p className="leading-snug">{message}</p>
      {actions.length > 0 && (
        <div className="flex gap-2">
          {actions.map((action) => (
            <button
              key={action.label}
              onClick={() => handleAction(action)}
              className={
                action.variant === 'ghost'
                  ? 'text-xs text-ash hover:text-chalk transition-colors cursor-pointer'
                  : 'text-xs px-3 py-1 rounded border border-neon/40 text-neon hover:bg-neon/10 transition-colors cursor-pointer'
              }
            >
              {action.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
