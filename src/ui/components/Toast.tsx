import { useEffect, useState } from 'react'

interface Props {
  message: string
  onDismiss: () => void
}

export default function Toast({ message, onDismiss }: Props) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    // Trigger enter animation on mount
    const enter = requestAnimationFrame(() => setVisible(true))
    const dismiss = setTimeout(() => {
      setVisible(false)
      setTimeout(onDismiss, 300) // wait for exit animation before unmounting
    }, 3000)
    return () => {
      cancelAnimationFrame(enter)
      clearTimeout(dismiss)
    }
  }, [onDismiss])

  return (
    <div
      className={`fixed bottom-5 right-5 z-50 flex items-center gap-2.5 bg-raised border border-rim text-chalk text-sm px-4 py-3 rounded-lg shadow-lg transition-all duration-300 ${
        visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'
      }`}
    >
      <span className="text-neon text-base leading-none">✓</span>
      {message}
    </div>
  )
}
