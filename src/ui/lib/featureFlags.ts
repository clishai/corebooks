export type BusinessType = 'freelancer' | 'service' | 'product' | 'nonprofit' | 'other'

export interface FeatureFlags {
  ar_ap: boolean
  inventory: boolean
}

const FLAGS_KEY = 'cb_flags'
const BUSINESS_TYPE_KEY = 'cb_business_type'

const DEFAULTS: FeatureFlags = {
  ar_ap: false,
  inventory: false,
}

export function getFeatureFlags(): FeatureFlags {
  const raw = localStorage.getItem(FLAGS_KEY)
  if (!raw) return { ...DEFAULTS }
  try {
    return { ...DEFAULTS, ...JSON.parse(raw) } as FeatureFlags
  } catch {
    return { ...DEFAULTS }
  }
}

export function saveFeatureFlags(flags: FeatureFlags): void {
  localStorage.setItem(FLAGS_KEY, JSON.stringify(flags))
}

export function isFeatureEnabled(key: keyof FeatureFlags): boolean {
  return getFeatureFlags()[key]
}

export function setFeatureEnabled(key: keyof FeatureFlags, value: boolean): void {
  saveFeatureFlags({ ...getFeatureFlags(), [key]: value })
}

export function getBusinessType(): BusinessType | null {
  return (localStorage.getItem(BUSINESS_TYPE_KEY) as BusinessType | null)
}

export function saveBusinessType(type: BusinessType): void {
  localStorage.setItem(BUSINESS_TYPE_KEY, type)
}
