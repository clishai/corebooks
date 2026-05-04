import { useState, useEffect, useCallback } from 'react'
import { api } from '../api/client'
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

export function useSearch(query: string): { results: SearchResult[]; loading: boolean } {
  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)

  const search = useCallback(async (q: string) => {
    if (!q.trim()) {
      setResults([])
      return
    }
    setLoading(true)
    try {
      const [accounts, entries] = await Promise.all([api.accounts.list(), api.entries.list()])
      const accountResults: SearchResult[] = accounts
        .filter((a) => matchesQuery(a.name, q) || matchesQuery(a.number, q))
        .slice(0, 5)
        .map((a) => ({
          id: a.id,
          type: 'account',
          label: `${a.number} — ${a.name}`,
          sublabel: a.type,
          path: '/accounts',
        }))
      const entryResults: SearchResult[] = entries
        .filter((e) => matchesQuery(e.memo ?? '', q) || matchesQuery(e.date?.slice(0, 10) ?? '', q))
        .slice(0, 5)
        .map((e) => ({
          id: e.id ?? e.date,
          type: 'entry',
          label: e.memo || '(no memo)',
          sublabel: e.date?.slice(0, 10),
          path: '/entries',
        }))
      const reportResults: SearchResult[] = ALL_REPORTS
        .filter((r) => matchesQuery(r.label, q))
        .map((r: ReportMeta) => ({
          id: r.id,
          type: 'report',
          label: r.label,
          sublabel: r.description,
          path: r.path,
        }))
      setResults([...accountResults, ...entryResults, ...reportResults])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const t = setTimeout(() => search(query), 200)
    return () => clearTimeout(t)
  }, [query, search])

  return { results, loading }
}
