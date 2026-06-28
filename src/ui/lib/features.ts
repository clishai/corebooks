export type FeatureTier = 'core' | 'workflow' | 'module'
export type FeatureStatus = 'enabled' | 'hidden'
export type LifecycleEventType = 'enabled' | 'hidden' | 're-enabled'

export interface FeatureDef {
  id: string
  tier: FeatureTier
  name: string
  description: string
  navPath?: string
  navLabel?: string
}

export interface LifecycleEvent {
  featureId: string
  featureName: string
  event: LifecycleEventType
  timestamp: string
}

export const FEATURE_REGISTRY: FeatureDef[] = [
  {
    id: 'chart-of-accounts',
    tier: 'core',
    name: 'Chart of Accounts',
    description: 'Track every asset, liability, equity, revenue, and expense account.',
  },
  {
    id: 'journal-entries',
    tier: 'core',
    name: 'Journal Entries & Drafts',
    description: 'Record double-entry bookkeeping transactions with full draft workflow.',
  },
  {
    id: 'recurring',
    tier: 'workflow',
    name: 'Recurring Entries',
    description: 'Automate repeating journal entries on a defined schedule.',
    navPath: '/extra/recurring',
    navLabel: 'Recurring',
  },
  {
    id: 'close-period',
    tier: 'workflow',
    name: 'Period Close',
    description: 'Lock accounting periods to prevent changes to finalized books.',
    navPath: '/extra/close-period',
    navLabel: 'Close Period',
  },
  {
    id: 'bank-feed',
    tier: 'workflow',
    name: 'Bank Feed & Import',
    description: 'Import bank CSV rows and map them to draft journal entries.',
    navPath: '/extra/bank-feed',
    navLabel: 'Bank Feed',
  },
  {
    id: 'reconciliation',
    tier: 'workflow',
    name: 'Reconciliation',
    description: 'Clear entries against bank statements to verify accuracy.',
    navPath: '/extra/reconciliation',
    navLabel: 'Reconciliation',
  },
  {
    id: 'bank-rules',
    tier: 'workflow',
    name: 'Bank Rules',
    description: 'Create auto-categorization rules for recurring import patterns.',
  },
  {
    id: 'ar_ap',
    tier: 'module',
    name: 'AR / AP',
    description: 'Track invoices, bills, and aging for customers and vendors.',
  },
  {
    id: 'inventory',
    tier: 'module',
    name: 'Inventory',
    description: 'Track SKUs, unit costs, and quantities on hand.',
  },
]

const ENABLED_BY_DEFAULT = new Set(['recurring', 'close-period', 'bank-feed', 'reconciliation'])

const STATE_KEY = 'cb_feature_state'
const LOG_KEY = 'cb_feature_log'

export function getFeatureStatuses(): Record<string, FeatureStatus> {
  const raw = localStorage.getItem(STATE_KEY)
  if (!raw) return {}
  try {
    return JSON.parse(raw) as Record<string, FeatureStatus>
  } catch {
    return {}
  }
}

function saveFeatureStatuses(statuses: Record<string, FeatureStatus>): void {
  localStorage.setItem(STATE_KEY, JSON.stringify(statuses))
}

export function isFeatureActive(id: string): boolean {
  const def = FEATURE_REGISTRY.find((f) => f.id === id)
  if (!def) return false
  if (def.tier === 'core') return true
  const statuses = getFeatureStatuses()
  if (id in statuses) return statuses[id] === 'enabled'
  return ENABLED_BY_DEFAULT.has(id)
}

export function enableFeature(id: string): void {
  const statuses = getFeatureStatuses()
  if (statuses[id] === 'enabled') return
  const wasHidden = statuses[id] === 'hidden'
  statuses[id] = 'enabled'
  saveFeatureStatuses(statuses)
  appendLifecycleEvent(id, wasHidden ? 're-enabled' : 'enabled')
}

export function hideFeature(id: string): void {
  const statuses = getFeatureStatuses()
  statuses[id] = 'hidden'
  saveFeatureStatuses(statuses)
  appendLifecycleEvent(id, 'hidden')
}

export function getLifecycleLog(): LifecycleEvent[] {
  const raw = localStorage.getItem(LOG_KEY)
  if (!raw) return []
  try {
    return JSON.parse(raw) as LifecycleEvent[]
  } catch {
    return []
  }
}

function appendLifecycleEvent(featureId: string, event: LifecycleEventType): void {
  const def = FEATURE_REGISTRY.find((f) => f.id === featureId)
  if (!def) return
  const log = getLifecycleLog()
  log.push({ featureId, featureName: def.name, event, timestamp: new Date().toISOString() })
  localStorage.setItem(LOG_KEY, JSON.stringify(log))
}
