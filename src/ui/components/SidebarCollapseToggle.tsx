interface Props {
  wide: boolean
  onToggle: () => void
}

export default function SidebarCollapseToggle({ wide, onToggle }: Props) {
  return (
    <div className="shrink-0 border-t border-rim">
      <button
        onClick={onToggle}
        title={wide ? 'Collapse sidebar' : 'Expand sidebar'}
        className="w-full flex items-center justify-center py-2 text-ash hover:text-chalk transition-colors cursor-pointer"
      >
        <span className="text-xs tracking-widest select-none">
          {wide ? '<<' : '>>'}
        </span>
      </button>
    </div>
  )
}
