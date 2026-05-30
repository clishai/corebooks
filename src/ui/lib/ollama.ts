export interface OllamaConfig {
  enabled: boolean
  endpoint: string
  model: string | null
}

const KEYS = {
  enabled: 'cb_ai_enabled',
  endpoint: 'cb_ai_endpoint',
  model: 'cb_ai_model',
}

// AI may suggest categorisation and draft entries, but official posting stays
// behind human/system posting authorities in the API layer.
export const AI_MAY_POST = false as const

const LOCAL_OLLAMA_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]'])

export function normalizeLocalOllamaEndpoint(endpoint: string): string | null {
  try {
    const url = new URL(endpoint.trim())
    if (url.protocol !== 'http:') return null
    if (!LOCAL_OLLAMA_HOSTS.has(url.hostname)) return null
    if (url.username || url.password) return null
    if (url.pathname !== '/' || url.search || url.hash) return null
    return url.origin
  } catch {
    return null
  }
}

export function isLocalOllamaEndpoint(endpoint: string): boolean {
  return normalizeLocalOllamaEndpoint(endpoint) !== null
}

export function getOllamaConfig(): OllamaConfig {
  return {
    enabled: localStorage.getItem(KEYS.enabled) === 'true',
    endpoint: localStorage.getItem(KEYS.endpoint) ?? 'http://localhost:11434',
    model: localStorage.getItem(KEYS.model),
  }
}

export function saveOllamaConfig(config: Partial<OllamaConfig>): void {
  if (config.enabled !== undefined) {
    localStorage.setItem(KEYS.enabled, String(config.enabled))
  }
  if (config.endpoint !== undefined) {
    localStorage.setItem(KEYS.endpoint, config.endpoint)
  }
  if (config.model !== undefined) {
    if (config.model === null) {
      localStorage.removeItem(KEYS.model)
    } else {
      localStorage.setItem(KEYS.model, config.model)
    }
  }
}

export async function checkOllama(
  endpoint: string,
): Promise<{ connected: boolean; models: string[] }> {
  const normalized = normalizeLocalOllamaEndpoint(endpoint)
  if (!normalized) return { connected: false, models: [] }

  try {
    const res = await fetch(`${normalized}/api/tags`, {
      signal: AbortSignal.timeout(2000),
    })
    if (!res.ok) return { connected: false, models: [] }
    const data = (await res.json()) as { models?: { name: string }[] }
    const models = (data.models ?? []).map((m) => m.name)
    return { connected: true, models }
  } catch {
    return { connected: false, models: [] }
  }
}
