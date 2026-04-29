export type AlertId = 'drafts' | 'memos'

export interface SnoozeOption {
  label: string
  ms: number | null
}

export const SNOOZE_OPTIONS: SnoozeOption[] = [
  { label: '10 minutes', ms: 10 * 60 * 1000 },
  { label: '1 hour',     ms: 60 * 60 * 1000 },
  { label: '6 hours',    ms: 6 * 60 * 60 * 1000 },
  { label: '1 day',      ms: 24 * 60 * 60 * 1000 },
  { label: '1 week',     ms: 7 * 24 * 60 * 60 * 1000 },
  { label: 'Never',      ms: null },
]

export const DEFAULT_SNOOZE_MS: number | null = 24 * 60 * 60 * 1000

const SNOOZE_KEY = 'cb_alert_snooze'

export function getSnoozeDuration(): number | null {
  const raw = localStorage.getItem(SNOOZE_KEY)
  if (!raw) return DEFAULT_SNOOZE_MS
  if (raw === 'never') return null
  const n = Number(raw)
  return isNaN(n) ? DEFAULT_SNOOZE_MS : n
}

export function saveSnoozeDuration(ms: number | null): void {
  localStorage.setItem(SNOOZE_KEY, ms === null ? 'never' : String(ms))
}

export function isDismissed(id: AlertId): boolean {
  const raw = localStorage.getItem(`cb_alert_dismissed_${id}`)
  if (!raw) return false
  const snooze = getSnoozeDuration()
  if (snooze === null) return true
  return Date.now() - Number(raw) < snooze
}

export function dismissAlert(id: AlertId): void {
  localStorage.setItem(`cb_alert_dismissed_${id}`, String(Date.now()))
}
