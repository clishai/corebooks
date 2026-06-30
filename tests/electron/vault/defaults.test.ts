import { describe, it, expect } from 'vitest'
import { DEFAULT_VAULT_SETTINGS, DEFAULT_VAULT_WORKSPACE } from '../../../src/electron/vault/defaults.js'

describe('defaults', () => {
  it('DEFAULT_VAULT_SETTINGS has schemaVersion 1 and all required fields', () => {
    expect(DEFAULT_VAULT_SETTINGS.schemaVersion).toBe(1)
    expect(typeof DEFAULT_VAULT_SETTINGS.companyName).toBe('string')
    expect(DEFAULT_VAULT_SETTINGS.fiscalYearStart).toEqual({ month: 1, day: 1 })
    expect(DEFAULT_VAULT_SETTINGS.currency).toBe('USD')
    expect(Array.isArray(DEFAULT_VAULT_SETTINGS.paymentMethods)).toBe(true)
    expect(DEFAULT_VAULT_SETTINGS.featureFlags).toEqual({ ar_ap: false, inventory: false })
  })

  it('DEFAULT_VAULT_WORKSPACE has schemaVersion 1 and safe defaults', () => {
    expect(DEFAULT_VAULT_WORKSPACE.schemaVersion).toBe(1)
    expect(DEFAULT_VAULT_WORKSPACE.lastTab).toBe('home')
    expect(DEFAULT_VAULT_WORKSPACE.sidebarCollapsed).toBe(false)
    expect(DEFAULT_VAULT_WORKSPACE.recentEntries).toEqual([])
  })

  it('DEFAULT_VAULT_SETTINGS is deep-cloneable (no shared references between callers)', () => {
    const a = structuredClone(DEFAULT_VAULT_SETTINGS)
    const b = structuredClone(DEFAULT_VAULT_SETTINGS)
    a.paymentMethods.push('test')
    expect(b.paymentMethods).not.toContain('test')
  })
})
