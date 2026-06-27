import type { FeatureFlags } from './featureFlags'

export type SlashCommandAction =
  | { type: 'navigate'; path: string }
  | { type: 'event'; name: string }
  | { type: 'setFlag'; key: keyof FeatureFlags; value: boolean }

export interface SlashCommand {
  id: string
  trigger: string
  label: string
  sublabel: string
  action: SlashCommandAction
}

export const SLASH_COMMANDS: SlashCommand[] = [
  // /go — navigation
  { id: 'go-home',                trigger: '/go home',                label: '/go home',                sublabel: 'Navigate to Home',                   action: { type: 'navigate', path: '/home' } },
  { id: 'go-accounts',            trigger: '/go accounts',            label: '/go accounts',            sublabel: 'Navigate to Chart of Accounts',       action: { type: 'navigate', path: '/accounts' } },
  { id: 'go-entries',             trigger: '/go entries',             label: '/go entries',             sublabel: 'Navigate to Entries',                 action: { type: 'navigate', path: '/entries' } },
  { id: 'go-drafts',              trigger: '/go drafts',              label: '/go drafts',              sublabel: 'Navigate to Drafts',                  action: { type: 'navigate', path: '/drafts' } },
  { id: 'go-reports',             trigger: '/go reports',             label: '/go reports',             sublabel: 'Navigate to Reports Library',          action: { type: 'navigate', path: '/reports' } },
  { id: 'go-recurring',           trigger: '/go recurring',           label: '/go recurring',           sublabel: 'Navigate to Recurring Entries',        action: { type: 'navigate', path: '/extra/recurring' } },
  { id: 'go-close-period',        trigger: '/go close-period',        label: '/go close-period',        sublabel: 'Navigate to Close Period',             action: { type: 'navigate', path: '/extra/close-period' } },
  { id: 'go-bank-feed',           trigger: '/go bank-feed',           label: '/go bank-feed',           sublabel: 'Navigate to Bank Feed Import',         action: { type: 'navigate', path: '/extra/bank-feed' } },
  { id: 'go-reconciliation',      trigger: '/go reconciliation',      label: '/go reconciliation',      sublabel: 'Navigate to Reconciliation',           action: { type: 'navigate', path: '/extra/reconciliation' } },
  { id: 'go-settings',            trigger: '/go settings',            label: '/go settings',            sublabel: 'Navigate to Settings',                action: { type: 'navigate', path: '/settings' } },
  { id: 'go-settings-vault',      trigger: '/go settings/vault',      label: '/go settings/vault',      sublabel: 'Open Vault settings tab',             action: { type: 'navigate', path: '/settings?tab=vault' } },
  { id: 'go-settings-navigation', trigger: '/go settings/navigation', label: '/go settings/navigation', sublabel: 'Open Navigation settings tab',        action: { type: 'navigate', path: '/settings?tab=navigation' } },
  { id: 'go-settings-shortcuts',  trigger: '/go settings/shortcuts',  label: '/go settings/shortcuts',  sublabel: 'Open Shortcuts settings tab',         action: { type: 'navigate', path: '/settings?tab=shortcuts' } },
  { id: 'go-settings-ai',         trigger: '/go settings/ai',         label: '/go settings/ai',         sublabel: 'Open AI settings tab',                action: { type: 'navigate', path: '/settings?tab=ai' } },
  // /new — open modals
  { id: 'new-entry',              trigger: '/new entry',              label: '/new entry',              sublabel: 'Open the New Entry modal',            action: { type: 'event', name: 'cb:open-new-entry' } },
  // /open — UI actions
  { id: 'open-nav-edit',          trigger: '/open nav-edit',          label: '/open nav-edit',          sublabel: 'Start sidebar navigation reordering', action: { type: 'event', name: 'cb:open-nav-edit' } },
  // /set — feature flags
  { id: 'set-ar-ap-on',           trigger: '/set ar-ap on',           label: '/set ar-ap on',           sublabel: 'Enable the AR/AP module',             action: { type: 'setFlag', key: 'ar_ap', value: true } },
  { id: 'set-ar-ap-off',          trigger: '/set ar-ap off',          label: '/set ar-ap off',          sublabel: 'Disable the AR/AP module',            action: { type: 'setFlag', key: 'ar_ap', value: false } },
  { id: 'set-inventory-on',       trigger: '/set inventory on',       label: '/set inventory on',       sublabel: 'Enable the Inventory module',         action: { type: 'setFlag', key: 'inventory', value: true } },
  { id: 'set-inventory-off',      trigger: '/set inventory off',      label: '/set inventory off',      sublabel: 'Disable the Inventory module',        action: { type: 'setFlag', key: 'inventory', value: false } },
]

export function matchSlashCommands(query: string): SlashCommand[] {
  const q = query.toLowerCase().trim()
  if (!q.startsWith('/')) return []
  return SLASH_COMMANDS.filter((cmd) => cmd.trigger.toLowerCase().startsWith(q))
}
