import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSearch, type SearchResult } from '../hooks/useSearch'

interface Props {
  onClose: () => void
}

const TYPE_LABEL: Record<SearchResult['type'], string> = {
  account: 'Account',
  entry: 'Entry',
  report: 'Report',
}

export default function CommandPalette({ onClose }: Props) {
  const [query, setQuery] = useState('')
  const [activeIdx, setActiveIdx] = useState(0)
  const { results, loading, error } = useSearch(query)
  const navigate = useNavigate()
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    setActiveIdx(0)
  }, [results])

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault()
      onClose()
      return
    }
    if (results.length === 0) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIdx((i) => Math.min(i + 1, results.length - 1))
      return
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIdx((i) => Math.max(i - 1, 0))
      return
    }
    if (e.key === 'Enter' && results[activeIdx]) {
      navigate(results[activeIdx].path)
      onClose()
    }
  }

  function handleSelect(result: SearchResult) {
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
        role="dialog"
        aria-modal="true"
        aria-label="Global search"
        onKeyDown={handleKeyDown}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center border-b border-rim px-4">
          <span className="text-ash mr-3" aria-hidden="true">🔍</span>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search accounts, entries, and reports"
            placeholder="Search accounts, entries, reports..."
            className="flex-1 bg-transparent py-3 text-chalk text-sm placeholder-ash/50 focus:outline-none"
          />
          {loading && <span className="text-ash text-xs">…</span>}
          <kbd className="text-ash text-[10px] border border-rim rounded px-1 ml-2">Esc</kbd>
        </div>
        {results.length > 0 && (
          <ul className="max-h-64 overflow-y-auto py-1">
            {results.map((result, i) => (
              <li key={`${result.type}-${result.id}`}>
                <button
                  onClick={() => handleSelect(result)}
                  onMouseEnter={() => setActiveIdx(i)}
                  aria-current={i === activeIdx ? 'true' : undefined}
                  className={`w-full text-left px-4 py-2.5 flex items-center justify-between transition-colors ${
                    i === activeIdx ? 'bg-raised' : 'hover:bg-raised/50'
                  }`}
                >
                  <div>
                    <span className="text-chalk text-sm">{result.label}</span>
                    {result.sublabel && (
                      <span className="text-ash text-xs ml-2">{result.sublabel}</span>
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
        {error && (
          <p className="text-red-300 text-sm px-4 py-3">{error}</p>
        )}
        {query.trim() && !loading && !error && results.length === 0 && (
          <p className="text-ash text-sm px-4 py-3">No results for &ldquo;{query}&rdquo;</p>
        )}
        {!query.trim() && (
          <p className="text-ash text-xs px-4 py-3">
            Type to search accounts, entries, and reports.
          </p>
        )}
      </div>
    </div>
  )
}
