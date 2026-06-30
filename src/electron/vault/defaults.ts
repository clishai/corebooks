import type { VaultSettings, VaultWorkspace } from './types.js'

export const DEFAULT_VAULT_SETTINGS: VaultSettings = {
  schemaVersion: 1,
  companyName: 'My Business',
  fiscalYearStart: { month: 1, day: 1 },
  currency: 'USD',
  paymentMethods: ['Cash', 'Check', 'Credit Card', 'Bank Transfer'],
  featureFlags: { ar_ap: false, inventory: false },
}

export const DEFAULT_VAULT_WORKSPACE: VaultWorkspace = {
  schemaVersion: 1,
  lastTab: 'home',
  sidebarCollapsed: false,
  recentEntries: [],
}
