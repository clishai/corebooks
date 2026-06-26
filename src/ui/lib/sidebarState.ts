// src/ui/lib/sidebarState.ts

const COLLAPSED_KEY = 'cb_sidebar_collapsed'
const PINNED_KEY = 'cb_pinned_reports'

type SectionId = 'ledger' | 'reports' | 'extra-workflows' | 'plugins'

const DEFAULT_PINNED = ['trial-balance', 'balance-sheet', 'income-statement']

export function getCollapsedSections(): SectionId[] {
  try {
    const raw = localStorage.getItem(COLLAPSED_KEY)
    return raw ? (JSON.parse(raw) as SectionId[]) : []
  } catch {
    return []
  }
}

export function toggleSectionCollapsed(id: SectionId): void {
  const current = getCollapsedSections()
  const next = current.includes(id) ? current.filter((s) => s !== id) : [...current, id]
  localStorage.setItem(COLLAPSED_KEY, JSON.stringify(next))
}

export function isSectionCollapsed(id: SectionId): boolean {
  return getCollapsedSections().includes(id)
}

export function expandSection(id: SectionId): void {
  const current = getCollapsedSections()
  if (!current.includes(id)) return
  const next = current.filter((s) => s !== id)
  localStorage.setItem(COLLAPSED_KEY, JSON.stringify(next))
  window.dispatchEvent(new CustomEvent('cb:expand-section', { detail: { id } }))
}

export function getPinnedReports(): string[] {
  try {
    const raw = localStorage.getItem(PINNED_KEY)
    return raw ? (JSON.parse(raw) as string[]) : [...DEFAULT_PINNED]
  } catch {
    return [...DEFAULT_PINNED]
  }
}

export function setPinnedReports(ids: string[]): void {
  localStorage.setItem(PINNED_KEY, JSON.stringify(ids))
}

export function togglePinnedReport(id: string): void {
  const current = getPinnedReports()
  const next = current.includes(id) ? current.filter((r) => r !== id) : [...current, id]
  setPinnedReports(next)
}

export function isReportPinned(id: string): boolean {
  return getPinnedReports().includes(id)
}
