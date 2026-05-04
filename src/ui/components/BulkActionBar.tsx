interface BulkAction {
  label: string
  onClick: () => void
  destructive?: boolean
}

interface Props {
  count: number
  actions: BulkAction[]
  onClear: () => void
}

export default function BulkActionBar({ count, actions, onClear }: Props) {
  if (count === 0) return null
  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 bg-raised border border-neon/40 rounded-sm px-5 py-3 shadow-lg shadow-black/40 animate-slide-up">
      <span className="text-ash text-xs">{count} selected</span>
      <div className="w-px h-4 bg-rim" />
      {actions.map((action) => (
        <button
          key={action.label}
          onClick={action.onClick}
          className={`text-xs font-medium transition-colors ${action.destructive ? 'text-red-400 hover:text-red-300' : 'text-neon hover:text-chalk'}`}
        >
          {action.label}
        </button>
      ))}
      <div className="w-px h-4 bg-rim" />
      <button onClick={onClear} className="text-ash hover:text-chalk text-xs transition-colors">
        Clear
      </button>
    </div>
  )
}
