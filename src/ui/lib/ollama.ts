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
  try {
    const res = await fetch(`${endpoint}/api/tags`, {
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
