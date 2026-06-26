import { describe, it, expect, beforeEach, vi } from 'vitest'

const store: Record<string, string> = {}
vi.stubGlobal('localStorage', {
  getItem: (key: string) => store[key] ?? null,
  setItem: (key: string, value: string) => { store[key] = value },
  removeItem: (key: string) => { delete store[key] },
  clear: () => { Object.keys(store).forEach((k) => delete store[k]) },
})

import {
  getSidebarWide,
  setSidebarWide,
  getNavSectionOrder,
  saveNavSectionOrder,
  DEFAULT_NAV_ORDER,
  type NavSectionId,
} from '../../src/ui/lib/sidebarLayout'

beforeEach(() => { Object.keys(store).forEach((k) => delete store[k]) })

describe('getSidebarWide', () => {
  it('returns true by default (sidebar starts expanded)', () => {
    expect(getSidebarWide()).toBe(true)
  })
  it('returns false after setSidebarWide(false)', () => {
    setSidebarWide(false)
    expect(getSidebarWide()).toBe(false)
  })
  it('returns true after setSidebarWide(true)', () => {
    setSidebarWide(false)
    setSidebarWide(true)
    expect(getSidebarWide()).toBe(true)
  })
})

describe('getNavSectionOrder', () => {
  it('returns default order when nothing is stored', () => {
    expect(getNavSectionOrder()).toEqual(DEFAULT_NAV_ORDER)
  })
  it('returns stored order with appended missing sections', () => {
    saveNavSectionOrder(['reports', 'ledger'])
    expect(getNavSectionOrder()).toEqual(['reports', 'ledger', 'workflows', 'modules'])
  })
  it('appends sections missing from stored order', () => {
    saveNavSectionOrder(['reports'])
    const order = getNavSectionOrder()
    expect(order[0]).toBe('reports')
    expect(order).toContain('ledger')
  })
  it('returns default on corrupt JSON', () => {
    store['cb_nav_order'] = 'not-json{'
    expect(getNavSectionOrder()).toEqual(DEFAULT_NAV_ORDER)
  })
})
