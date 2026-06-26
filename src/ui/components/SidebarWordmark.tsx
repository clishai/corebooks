interface Props {
  wide: boolean
  onClick: () => void
}

export default function SidebarWordmark({ wide, onClick }: Props) {
  return (
    <button
      onClick={onClick}
      className="px-4 py-3 border-b border-rim w-full text-left hover:opacity-80 transition-opacity cursor-pointer shrink-0"
      title="corebooks"
    >
      {wide ? (
        <span className="text-sm font-light text-chalk tracking-wide">
          ~/ corebooks
        </span>
      ) : (
        <span className="text-sm font-light text-chalk tracking-wide">
          ~/
        </span>
      )}
    </button>
  )
}
