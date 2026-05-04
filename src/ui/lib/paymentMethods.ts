const STORAGE_KEY = 'cb_payment_methods'

const DEFAULTS: string[] = ['Cash', 'Check', 'ACH', 'Credit Card', 'Wire Transfer']

export function getPaymentMethods(): string[] {
  const raw = localStorage.getItem(STORAGE_KEY)
  if (!raw) return [...DEFAULTS]
  try {
    return JSON.parse(raw) as string[]
  } catch {
    return [...DEFAULTS]
  }
}

export function savePaymentMethods(methods: string[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(methods))
}
