const LOCAL_KEYS = ['cb_company_name', 'cb_flags', 'cb_payment_methods'] as const
const MIGRATED_MARKER = 'cb_local_settings_migrated'

export interface MigratedSettings {
  companyName?: string
  featureFlags?: { ar_ap?: boolean; inventory?: boolean }
  paymentMethods?: string[]
}

export function readLocalLegacySettings(): MigratedSettings | null {
  if (localStorage.getItem(MIGRATED_MARKER) === '1') return null
  const has = LOCAL_KEYS.some(k => localStorage.getItem(k) !== null)
  if (!has) {
    localStorage.setItem(MIGRATED_MARKER, '1')
    return null
  }
  const out: MigratedSettings = {}
  const name = localStorage.getItem('cb_company_name'); if (name) out.companyName = name
  const flags = localStorage.getItem('cb_flags'); if (flags) try { out.featureFlags = JSON.parse(flags) } catch { /* ignore malformed */ }
  const methods = localStorage.getItem('cb_payment_methods'); if (methods) try { out.paymentMethods = JSON.parse(methods) } catch { /* ignore malformed */ }
  return out
}

export function markLegacyMigrationComplete(): void {
  for (const k of LOCAL_KEYS) localStorage.removeItem(k)
  localStorage.setItem(MIGRATED_MARKER, '1')
}
