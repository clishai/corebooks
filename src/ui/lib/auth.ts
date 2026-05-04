const TOKEN_KEY = 'cb_auth_token'

export function getAuthToken(): string | null {
  return sessionStorage.getItem(TOKEN_KEY)
}

export function setAuthToken(token: string): void {
  sessionStorage.setItem(TOKEN_KEY, token)
}

export function clearAuthToken(): void {
  sessionStorage.removeItem(TOKEN_KEY)
}

export async function checkAuthStatus(): Promise<{ active: boolean; needsSetup: boolean }> {
  const res = await fetch('/auth/status')
  return res.json() as Promise<{ active: boolean; needsSetup: boolean }>
}

export async function login(
  email: string,
  password: string,
): Promise<{ token: string; user: { role: string } }> {
  const res = await fetch('/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  if (!res.ok) {
    const data = (await res.json()) as { error?: string }
    throw new Error(data.error ?? 'Login failed')
  }
  return res.json() as Promise<{ token: string; user: { role: string } }>
}

export async function setupAdmin(
  email: string,
  password: string,
): Promise<{ token: string }> {
  const res = await fetch('/auth/setup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  if (!res.ok) {
    const data = (await res.json()) as { error?: string }
    throw new Error(data.error ?? 'Setup failed')
  }
  return res.json() as Promise<{ token: string }>
}
