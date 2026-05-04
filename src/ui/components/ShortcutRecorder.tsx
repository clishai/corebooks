import { useState, useRef } from 'react'
import { type ShortcutBinding, formatBinding, bindingFromKeyboardEvent } from '../lib/shortcuts'

interface Props {
  binding: ShortcutBinding
  onChange: (binding: ShortcutBinding) => void
  conflict?: string | null
}

export default function ShortcutRecorder({ binding, onChange, conflict }: Props) {
  const [recording, setRecording] = useState(false)
  const inputRef = useRef<HTMLButtonElement>(null)

  function handleKeyDown(e: React.KeyboardEvent) {
    e.preventDefault()
    e.stopPropagation()
    if (e.key === 'Escape') {
      setRecording(false)
      return
    }
    if (['Meta', 'Control', 'Shift', 'Alt'].includes(e.key)) return
    onChange(bindingFromKeyboardEvent(e.nativeEvent))
    setRecording(false)
  }

  return (
    <div className="flex items-center gap-2">
      <button
        ref={inputRef}
        onKeyDown={recording ? handleKeyDown : undefined}
        onClick={() => {
          setRecording(true)
          inputRef.current?.focus()
        }}
        onBlur={() => setRecording(false)}
        className={`min-w-[120px] text-left px-3 py-1.5 rounded-sm border text-xs font-mono transition-colors focus:outline-none ${
          recording
            ? 'border-neon bg-raised text-neon'
            : conflict
              ? 'border-amber-500 bg-raised text-amber-400'
              : 'border-rim bg-raised text-chalk hover:border-neon/50'
        }`}
      >
        {recording ? 'Press keys…' : formatBinding(binding)}
      </button>
      {conflict && (
        <span className="text-amber-400 text-xs">conflicts with &ldquo;{conflict}&rdquo;</span>
      )}
    </div>
  )
}
