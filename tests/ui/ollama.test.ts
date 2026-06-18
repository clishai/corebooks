import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock fetch globally
const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

// Mock localStorage
const store: Record<string, string> = {}
vi.stubGlobal('localStorage', {
  getItem: (key: string) => store[key] ?? null,
  setItem: (key: string, value: string) => { store[key] = value },
  removeItem: (key: string) => { delete store[key] },
})

// Import after mocking
const {
  checkOllama,
  getOllamaConfig,
  saveOllamaConfig,
  normalizeLocalOllamaEndpoint,
  isLocalOllamaEndpoint,
} = await import('../../src/ui/lib/ollama.js')

describe('checkOllama', () => {
  beforeEach(() => { mockFetch.mockReset() })

  it('returns connected true with models on success', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ models: [{ name: 'llama3.2' }, { name: 'mistral' }] }),
    })
    const result = await checkOllama('http://localhost:11434')
    expect(result.connected).toBe(true)
    expect(result.models).toEqual(['llama3.2', 'mistral'])
  })

  it('returns connected false on non-ok response', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false })
    const result = await checkOllama('http://localhost:11434')
    expect(result.connected).toBe(false)
    expect(result.models).toEqual([])
  })

  it('returns connected false on network error', async () => {
    mockFetch.mockRejectedValueOnce(new Error('ECONNREFUSED'))
    const result = await checkOllama('http://localhost:11434')
    expect(result.connected).toBe(false)
    expect(result.models).toEqual([])
  })

  it('rejects non-local endpoints without fetching', async () => {
    const result = await checkOllama('http://example.com:11434')
    expect(result.connected).toBe(false)
    expect(result.models).toEqual([])
    expect(mockFetch).not.toHaveBeenCalled()
  })
})

describe('Ollama endpoint validation', () => {
  it('normalizes localhost endpoints', () => {
    expect(normalizeLocalOllamaEndpoint('http://localhost:11434/')).toBe('http://localhost:11434')
    expect(normalizeLocalOllamaEndpoint('http://127.0.0.1:11434')).toBe('http://127.0.0.1:11434')
  })

  it('rejects remote, credentialed, and path endpoints', () => {
    expect(isLocalOllamaEndpoint('https://localhost:11434')).toBe(false)
    expect(isLocalOllamaEndpoint('http://user:pass@localhost:11434')).toBe(false)
    expect(isLocalOllamaEndpoint('http://localhost:11434/proxy')).toBe(false)
    expect(isLocalOllamaEndpoint('http://192.168.1.10:11434')).toBe(false)
  })
})

describe('getOllamaConfig / saveOllamaConfig', () => {
  beforeEach(() => { Object.keys(store).forEach((k) => delete store[k]) })

  it('returns defaults when nothing saved', () => {
    const config = getOllamaConfig()
    expect(config.enabled).toBe(false)
    expect(config.endpoint).toBe('http://localhost:11434')
    expect(config.model).toBeNull()
  })

  it('round-trips saved config', () => {
    saveOllamaConfig({ enabled: true, endpoint: 'http://localhost:11434', model: 'llama3.2' })
    const config = getOllamaConfig()
    expect(config.enabled).toBe(true)
    expect(config.model).toBe('llama3.2')
  })

  it('partial save merges with existing', () => {
    saveOllamaConfig({ enabled: true })
    saveOllamaConfig({ model: 'mistral' })
    const config = getOllamaConfig()
    expect(config.enabled).toBe(true)
    expect(config.model).toBe('mistral')
  })
})
