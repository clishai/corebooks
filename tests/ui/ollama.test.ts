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
const { checkOllama, getOllamaConfig, saveOllamaConfig } = await import('../../src/ui/lib/ollama.js')

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
