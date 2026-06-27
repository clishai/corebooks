import { describe, it, expect, beforeEach, vi } from 'vitest'

describe('setFeatureEnabled', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', (() => {
      const store: Record<string, string> = {}
      return {
        getItem: (k: string) => store[k] ?? null,
        setItem: (k: string, v: string) => { store[k] = v },
        removeItem: (k: string) => { delete store[k] },
        clear: () => { Object.keys(store).forEach((k) => delete store[k]) },
      }
    })())
  })

  it('enables a flag that was off by default', async () => {
    const { setFeatureEnabled, isFeatureEnabled } = await import('../../src/ui/lib/featureFlags')
    setFeatureEnabled('ar_ap', true)
    expect(isFeatureEnabled('ar_ap')).toBe(true)
  })

  it('disables a flag', async () => {
    const { setFeatureEnabled, isFeatureEnabled } = await import('../../src/ui/lib/featureFlags')
    setFeatureEnabled('ar_ap', true)
    setFeatureEnabled('ar_ap', false)
    expect(isFeatureEnabled('ar_ap')).toBe(false)
  })

  it('does not affect sibling flags', async () => {
    const { setFeatureEnabled, isFeatureEnabled } = await import('../../src/ui/lib/featureFlags')
    setFeatureEnabled('ar_ap', true)
    expect(isFeatureEnabled('inventory')).toBe(false)
  })

  it('round-trips both flags independently', async () => {
    const { setFeatureEnabled, isFeatureEnabled } = await import('../../src/ui/lib/featureFlags')
    setFeatureEnabled('ar_ap', true)
    setFeatureEnabled('inventory', true)
    setFeatureEnabled('ar_ap', false)
    expect(isFeatureEnabled('ar_ap')).toBe(false)
    expect(isFeatureEnabled('inventory')).toBe(true)
  })
})
