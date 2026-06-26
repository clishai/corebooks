export type NavSectionId = 'ledger' | 'reports' | 'workflows' | 'modules'

export const DEFAULT_NAV_ORDER: NavSectionId[] = ['ledger', 'reports', 'workflows', 'modules']

const WIDE_KEY = 'cb_sidebar_wide'
const ORDER_KEY = 'cb_nav_order'

export function getSidebarWide(): boolean {
  const val = localStorage.getItem(WIDE_KEY)
  return val === null ? true : val === 'true'
}

export function setSidebarWide(wide: boolean): void {
  localStorage.setItem(WIDE_KEY, String(wide))
}

export function getNavSectionOrder(): NavSectionId[] {
  try {
    const raw = localStorage.getItem(ORDER_KEY)
    if (!raw) return [...DEFAULT_NAV_ORDER]
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return [...DEFAULT_NAV_ORDER]
    const valid = parsed.filter((id): id is NavSectionId =>
      DEFAULT_NAV_ORDER.includes(id as NavSectionId),
    )
    const missing = DEFAULT_NAV_ORDER.filter((id) => !valid.includes(id))
    return [...valid, ...missing]
  } catch {
    return [...DEFAULT_NAV_ORDER]
  }
}

export function saveNavSectionOrder(order: NavSectionId[]): void {
  localStorage.setItem(ORDER_KEY, JSON.stringify(order))
}
