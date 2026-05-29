import { useState, useEffect, useCallback, useRef } from 'react'
import { api, type JournalEntry } from '../api/client'
import { ALL_REPORTS, type ReportMeta } from '../lib/reports'

export interface SearchResult {
  id: string
  type: 'account' | 'entry' | 'report'
  label: string
  sublabel?: string
  path: string
}

function matchesQuery(text: string, query: string): boolean {
  return text.toLowerCase().includes(query.toLowerCase())
}

function localDateLabel(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

function hasEntryId(entry: JournalEntry): entry is JournalEntry & { id: string } {
  return typeof entry.id === 'string' && entry.id.length > 0
}

export function useSearch(query: string): { results: SearchResult[]; loading: boolean; error: string | null } {
  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const requestIdRef = useRef(0)

  const search = useCallback(async (q: string) => {
    const requestId = ++requestIdRef.current
    if (!q.trim()) {
      setResults([])
      setLoading(false)
      setError(null)
      return
    }
    setLoading(true)
    setResults([])
    setError(null)
    try {
      const [accounts, entries] = await Promise.all([api.accounts.list(), api.entries.list()])
      if (requestId !== requestIdRef.current) return

      const accountResults: SearchResult[] = accounts
        .filter((a) => matchesQuery(a.name, q) || matchesQuery(a.number, q) || matchesQuery(a.type, q))
        .slice(0, 5)
        .map((a) => ({
          id: a.id,
          type: 'account',
          label: `${a.number} — ${a.name}`,
          sublabel: a.type,
          path: '/accounts',
        }))
      const entryResults: SearchResult[] = entries
        .filter(hasEntryId)
        .filter((e) => {
          const dateIso = e.date?.slice(0, 10) ?? ''
          const dateLabel = e.date ? localDateLabel(e.date) : ''
          return (
            matchesQuery(e.memo ?? '', q) ||
            matchesQuery(e.paymentMethod ?? '', q) ||
            matchesQuery(dateIso, q) ||
            matchesQuery(dateLabel, q) ||
            e.lines.some((line) => matchesQuery(line.memo ?? '', q))
          )
        })
        .slice(0, 5)
        .map((e) => ({
          id: e.id,
          type: 'entry',
          label: e.memo || '(no memo)',
          sublabel: e.date ? localDateLabel(e.date) : undefined,
          path: `/entries?preset=all-time&entry=${encodeURIComponent(e.id)}`,
        }))
      const reportResults: SearchResult[] = ALL_REPORTS
        .filter((r) => matchesQuery(r.label, q) || matchesQuery(r.description, q))
        .map((r: ReportMeta) => ({
          id: r.id,
          type: 'report',
          label: r.label,
          sublabel: r.description,
          path: r.path,
        }))
      if (requestId !== requestIdRef.current) return
      setResults([...accountResults, ...entryResults, ...reportResults])
    } catch {
      if (requestId !== requestIdRef.current) return
      setResults([])
      setError('Search failed. Check that the local API is running.')
    } finally {
      if (requestId === requestIdRef.current) setLoading(false)
    }
  }, [])

  useEffect(() => {
    requestIdRef.current++
    setResults([])
    setError(null)
    if (!query.trim()) {
      setLoading(false)
      return
    }

    const t = setTimeout(() => search(query), 200)
    return () => {
      clearTimeout(t)
      requestIdRef.current++
    }
  }, [query, search])

  return { results, loading, error }
}
