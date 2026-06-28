import { describe, it, expect, beforeEach, vi } from 'vitest'

function makeLocalStorage() {
  const store: Record<string, string> = {}
  return {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => { store[k] = v },
    removeItem: (k: string) => { delete store[k] },
    clear: () => { Object.keys(store).forEach((k) => delete store[k]) },
  }
}

describe('features.ts', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', makeLocalStorage())
  })

  describe('FEATURE_REGISTRY', () => {
    it('contains core, workflow, and module tiers', async () => {
      const { FEATURE_REGISTRY } = await import('../../src/ui/lib/features')
      const tiers = new Set(FEATURE_REGISTRY.map((f) => f.tier))
      expect(tiers).toContain('core')
      expect(tiers).toContain('workflow')
      expect(tiers).toContain('module')
    })

    it('every feature has a unique id', async () => {
      const { FEATURE_REGISTRY } = await import('../../src/ui/lib/features')
      const ids = FEATURE_REGISTRY.map((f) => f.id)
      expect(new Set(ids).size).toBe(ids.length)
    })

    it('workflow features with a navPath also have a navLabel', async () => {
      const { FEATURE_REGISTRY } = await import('../../src/ui/lib/features')
      FEATURE_REGISTRY
        .filter((f) => f.tier === 'workflow' && f.navPath !== undefined)
        .forEach((f) => {
          expect(f.navLabel).toBeTruthy()
        })
    })
  })

  describe('isFeatureActive', () => {
    it('always returns true for core features', async () => {
      const { FEATURE_REGISTRY, isFeatureActive } = await import('../../src/ui/lib/features')
      const coreFeatures = FEATURE_REGISTRY.filter((f) => f.tier === 'core')
      expect(coreFeatures.length).toBeGreaterThan(0)
      coreFeatures.forEach((f) => {
        expect(isFeatureActive(f.id)).toBe(true)
      })
    })

    it('returns false for an unknown feature id', async () => {
      const { isFeatureActive } = await import('../../src/ui/lib/features')
      expect(isFeatureActive('nonexistent')).toBe(false)
    })

    it('returns true for workflow features in ENABLED_BY_DEFAULT when no state stored', async () => {
      const { isFeatureActive } = await import('../../src/ui/lib/features')
      expect(isFeatureActive('bank-feed')).toBe(true)
      expect(isFeatureActive('reconciliation')).toBe(true)
      expect(isFeatureActive('recurring')).toBe(true)
      expect(isFeatureActive('close-period')).toBe(true)
    })

    it('returns false for module features with no state stored', async () => {
      const { isFeatureActive } = await import('../../src/ui/lib/features')
      expect(isFeatureActive('ar_ap')).toBe(false)
      expect(isFeatureActive('inventory')).toBe(false)
    })

    it('returns true for an explicitly enabled feature', async () => {
      const { enableFeature, isFeatureActive } = await import('../../src/ui/lib/features')
      enableFeature('ar_ap')
      expect(isFeatureActive('ar_ap')).toBe(true)
    })

    it('returns false for an explicitly hidden feature that was default-enabled', async () => {
      const { hideFeature, isFeatureActive } = await import('../../src/ui/lib/features')
      hideFeature('bank-feed')
      expect(isFeatureActive('bank-feed')).toBe(false)
    })
  })

  describe('enableFeature / hideFeature', () => {
    it('enableFeature persists enabled status', async () => {
      const { enableFeature, getFeatureStatuses } = await import('../../src/ui/lib/features')
      enableFeature('ar_ap')
      expect(getFeatureStatuses()['ar_ap']).toBe('enabled')
    })

    it('hideFeature persists hidden status', async () => {
      const { hideFeature, getFeatureStatuses } = await import('../../src/ui/lib/features')
      hideFeature('bank-feed')
      expect(getFeatureStatuses()['bank-feed']).toBe('hidden')
    })

    it('enabling a previously hidden feature appends a re-enabled event', async () => {
      const { enableFeature, hideFeature, getLifecycleLog } = await import('../../src/ui/lib/features')
      hideFeature('bank-feed')
      enableFeature('bank-feed')
      const log = getLifecycleLog()
      expect(log[log.length - 1].event).toBe('re-enabled')
    })

    it('enabling a new feature appends an enabled event', async () => {
      const { enableFeature, getLifecycleLog } = await import('../../src/ui/lib/features')
      enableFeature('ar_ap')
      const log = getLifecycleLog()
      expect(log[log.length - 1].event).toBe('enabled')
      expect(log[log.length - 1].featureId).toBe('ar_ap')
    })

    it('hideFeature appends a hidden event', async () => {
      const { hideFeature, getLifecycleLog } = await import('../../src/ui/lib/features')
      hideFeature('bank-feed')
      const log = getLifecycleLog()
      expect(log[log.length - 1].event).toBe('hidden')
      expect(log[log.length - 1].featureId).toBe('bank-feed')
    })
  })

  describe('getLifecycleLog', () => {
    it('returns empty array when no log exists', async () => {
      const { getLifecycleLog } = await import('../../src/ui/lib/features')
      expect(getLifecycleLog()).toEqual([])
    })

    it('accumulates events in chronological order', async () => {
      const { enableFeature, hideFeature, enableFeature: enable2, getLifecycleLog } = await import('../../src/ui/lib/features')
      enableFeature('ar_ap')
      hideFeature('ar_ap')
      enable2('ar_ap')
      const log = getLifecycleLog()
      expect(log).toHaveLength(3)
      expect(log.map((e) => e.event)).toEqual(['enabled', 'hidden', 're-enabled'])
    })

    it('each event has featureId, featureName, event, and timestamp fields', async () => {
      const { enableFeature, getLifecycleLog } = await import('../../src/ui/lib/features')
      enableFeature('ar_ap')
      const [entry] = getLifecycleLog()
      expect(entry.featureId).toBe('ar_ap')
      expect(typeof entry.featureName).toBe('string')
      expect(entry.event).toBe('enabled')
      expect(new Date(entry.timestamp).getFullYear()).toBeGreaterThan(2020)
    })
  })
})
