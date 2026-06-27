import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSearch, type SearchResult } from '../hooks/useSearch'
import { matchSlashCommands, type SlashCommand } from '../lib/slashCommands'
import { setFeatureEnabled } from '../lib/featureFlags'

interface Props {
  onClose: () => void
}

const TYPE_LABEL: Record<SearchResult['type'], string> = {
  account: 'Account',
  entry: 'Entry',
  report: 'Report',
  destination: 'Go',
}

export default function CommandPalette({ onClose }: Props) {
  const [query, setQuery] = useState('')
  const [activeIdx, setActiveIdx] = useState(0)
  const navigate = useNavigate()
  const inputRef = useRef<HTMLInputElement>(null)
  const activeRef = useRef<HTMLLIElement>(null)

  const isSlashMode = query.startsWith('/')
  const { results: searchResults, loading, error } = useSearch(isSlashMode ? '' : query)
  const slashMatches = isSlashMode ? matchSlashCommands(query) : []
  const resultCount = isSlashMode ? slashMatches.length : searchResults.length

  useEffect(() => { inputRef.current?.focus() }, [])
  useEffect(() => { setActiveIdx(0) }, [query])
  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: 'nearest' })
  }, [activeIdx])

  function executeSlashCommand(cmd: SlashCommand) {
    if (cmd.action.type === 'navigate') {
      navigate(cmd.action.path)
    } else if (cmd.action.type === 'event') {
      window.dispatchEvent(new CustomEvent(cmd.action.name))
    } else if (cmd.action.type === 'setFlag') {
      setFeatureEnabled(cmd.action.key, cmd.action.value)
    }
    onClose()
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') { onClose(); return }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIdx((i) => Math.min(i + 1, resultCount - 1))
      return
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIdx((i) => Math.max(i - 1, 0))
      return
    }
    if (e.key === 'Enter') {
      if (isSlashMode && slashMatches[activeIdx]) {
        executeSlashCommand(slashMatches[activeIdx])
      } else if (!isSlashMode && searchResults[activeIdx]) {
        navigate(searchResults[activeIdx].path)
        onClose()
      }
    }
  }

  function handleSelectSearch(result: SearchResult) {
    navigate(result.path)
    onClose()
  }

  return (
    <div
      className="fixed inset-0 bg-black/60 z-50 flex items-start justify-center pt-24"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg bg-surface border border-rim rounded-sm shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Input row */}
        <div className="flex items-center border-b border-rim px-4">
          <span className="text-ash mr-3 select-none">{isSlashMode ? <span className="text-neon font-mono text-sm">/</span> : '🔍'}</span>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={isSlashMode ? 'Type a command…' : 'Search accounts, entries, reports…'}
            className="flex-1 bg-transparent py-3 text-chalk text-sm placeholder-ash/50 focus:outline-none"
          />
          {loading && !isSlashMode && <span className="text-ash text-xs">…</span>}
          <kbd className="text-ash text-[10px] border border-rim rounded px-1 ml-2">Esc</kbd>
        </div>

        {/* Slash mode: command list */}
        {isSlashMode && slashMatches.length > 0 && (
          <ul className="max-h-64 overflow-y-auto py-1">
            {slashMatches.map((cmd, i) => (
              <li key={cmd.id} ref={i === activeIdx ? activeRef : null}>
                <button
                  onClick={() => executeSlashCommand(cmd)}
                  onMouseEnter={() => setActiveIdx(i)}
                  className={`w-full text-left px-4 py-2.5 flex items-center justify-between transition-colors ${
                    i === activeIdx ? 'bg-raised' : 'hover:bg-raised/50'
                  }`}
                >
                  <div>
                    <span className="text-neon text-xs font-mono">{cmd.label}</span>
                    <span className="text-ash text-[10px] ml-2">{cmd.sublabel}</span>
                  </div>
                  <span className="text-violet text-[10px] uppercase tracking-wider">cmd</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {isSlashMode && slashMatches.length === 0 && query.trim().length <= 1 && (
          <p className="text-ash text-xs px-4 py-3">
            Try <span className="text-neon font-mono">/go</span>, <span className="text-neon font-mono">/new</span>, <span className="text-neon font-mono">/open</span>, or <span className="text-neon font-mono">/set</span>
          </p>
        )}
        {isSlashMode && slashMatches.length === 0 && query.trim().length > 1 && (
          <p className="text-ash text-sm px-4 py-3">No commands match &ldquo;{query}&rdquo;</p>
        )}

        {/* Search mode: async results */}
        {!isSlashMode && searchResults.length > 0 && (
          <ul className="max-h-64 overflow-y-auto py-1">
            {searchResults.map((result, i) => (
              <li key={`${result.type}-${result.id}`} ref={i === activeIdx ? activeRef : null}>
                <button
                  onClick={() => handleSelectSearch(result)}
                  onMouseEnter={() => setActiveIdx(i)}
                  className={`w-full text-left px-4 py-2.5 flex items-center justify-between transition-colors ${
                    i === activeIdx ? 'bg-raised' : 'hover:bg-raised/50'
                  }`}
                >
                  <div>
                    <span className="text-chalk text-xs">{result.label}</span>
                    {result.sublabel && (
                      <span className="text-ash text-[10px] ml-2">{result.sublabel}</span>
                    )}
                  </div>
                  <span className="text-ash text-[10px] uppercase tracking-wider">
                    {TYPE_LABEL[result.type]}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {!isSlashMode && error && (
          <p className="text-red-400 text-xs px-4 py-3">{error}</p>
        )}
        {!isSlashMode && !error && query.trim() && !loading && searchResults.length === 0 && (
          <p className="text-ash text-sm px-4 py-3">No results for &ldquo;{query}&rdquo;</p>
        )}
        {!isSlashMode && !query.trim() && (
          <p className="text-ash text-xs px-4 py-3">
            Type to search · <span className="text-neon font-mono">/</span> for commands
          </p>
        )}
      </div>
    </div>
  )
}
