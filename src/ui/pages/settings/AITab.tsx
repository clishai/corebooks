import { useState, useEffect, useRef } from 'react'
import {
  getOllamaConfig,
  saveOllamaConfig,
  checkOllama,
  isLocalOllamaEndpoint,
  type OllamaConfig,
} from '../../lib/ollama'

function notifyAiConfigChanged(): void {
  window.dispatchEvent(new CustomEvent('cb:ai-config-changed'))
}

export default function AITab() {
  const [config, setConfig] = useState<OllamaConfig>(getOllamaConfig)
  const [status, setStatus] = useState<{ connected: boolean; models: string[] } | null>(null)
  const [checking, setChecking] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (config.enabled) void runCheck()
  }, [config.enabled])

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [])

  async function runCheck(endpoint = config.endpoint): Promise<void> {
    setChecking(true)
    const result = await checkOllama(endpoint)
    setStatus(result)
    if (result.connected && config.model && !result.models.includes(config.model)) {
      setConfig((current) => ({ ...current, model: null }))
      saveOllamaConfig({ model: null })
      notifyAiConfigChanged()
    }
    setChecking(false)
  }

  function handleEnable() {
    const next = { ...config, enabled: true }
    setConfig(next)
    saveOllamaConfig({ enabled: true })
    notifyAiConfigChanged()
  }

  function handleDisable() {
    const next = { ...config, enabled: false }
    setConfig(next)
    saveOllamaConfig({ enabled: false })
    setStatus(null)
    notifyAiConfigChanged()
  }

  function handleEndpointChange(endpoint: string) {
    const next = { ...config, endpoint }
    setConfig(next)
    saveOllamaConfig({ endpoint })
    setStatus(null)
    notifyAiConfigChanged()
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => void runCheck(endpoint), 500)
  }

  function handleModelChange(model: string) {
    const next = { ...config, model: model || null }
    setConfig(next)
    saveOllamaConfig({ model: model || null })
    notifyAiConfigChanged()
  }

  if (!config.enabled) {
    return (
      <div className="space-y-6 max-w-lg">
        <div className="bg-surface border border-rim rounded-lg px-5 py-5 space-y-3">
          <p className="text-sm text-ash leading-relaxed">
            AI assistance connects corebooks to a local Ollama model running on your machine.
            Keep the endpoint on localhost so financial data stays on this computer — there is no cloud,
            no account, and no subscription.
          </p>
        </div>

        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-chalk">Setup guide</h3>
          <ol className="space-y-3 text-sm text-ash">
            <li className="flex gap-3">
              <span className="text-neon font-semibold shrink-0">1.</span>
              <span>
                Download and install Ollama from{' '}
                <a href="https://ollama.com" target="_blank" rel="noreferrer" className="text-neon hover:underline">
                  ollama.com
                </a>{' '}
                — free, no account required.
              </span>
            </li>
            <li className="flex gap-3">
              <span className="text-neon font-semibold shrink-0">2.</span>
              <span>
                Open Terminal and run this command to download a model:
                <br />
                <code className="inline-block mt-1.5 text-xs text-chalk bg-raised border border-rim px-3 py-1.5 rounded font-mono">
                  ollama pull llama3.2
                </code>
              </span>
            </li>
            <li className="flex gap-3">
              <span className="text-neon font-semibold shrink-0">3.</span>
              <span>Ollama runs silently in the background — nothing else to configure.</span>
            </li>
            <li className="flex gap-3">
              <span className="text-neon font-semibold shrink-0">4.</span>
              <span>Come back here and click <strong className="text-chalk">Enable AI assistance</strong>.</span>
            </li>
          </ol>
          <p className="text-xs text-ash/60 italic">
            The terminal step is temporary. A future release will handle Ollama installation entirely within corebooks.
          </p>
        </div>

        <button
          onClick={handleEnable}
          className="px-4 py-2 text-sm font-medium rounded-md border border-neon/40 text-neon hover:bg-neon/10 transition-colors cursor-pointer"
        >
          Enable AI assistance
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-6 max-w-lg">
      {/* Connection status */}
      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-chalk">Connection status</h3>
        <div className="flex items-center gap-3">
          {checking ? (
            <span className="text-sm text-ash">Checking…</span>
          ) : status === null ? (
            <span className="text-sm text-ash">Not checked yet</span>
          ) : (
            <span className="flex items-center gap-2 text-sm">
              <span className={`w-2 h-2 rounded-full shrink-0 ${status.connected ? 'bg-emerald-400' : 'bg-red-400'}`} />
              <span className={status.connected ? 'text-emerald-300' : 'text-red-300'}>
                {status.connected
                  ? `Ollama connected — ${status.models.length} model${status.models.length !== 1 ? 's' : ''} available`
                  : 'Ollama not found — is it running? Try: ollama serve'}
              </span>
            </span>
          )}
          <button
            onClick={() => void runCheck()}
            disabled={checking}
            className="text-xs text-ash hover:text-chalk transition-colors disabled:opacity-40 cursor-pointer"
          >
            ↺ Refresh
          </button>
        </div>
      </div>

      {/* Endpoint */}
      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-chalk">Endpoint</h3>
        <input
          type="text"
          value={config.endpoint}
          onChange={(e) => handleEndpointChange(e.target.value)}
          className="w-full bg-raised border border-rim rounded-md px-3 py-2 text-chalk text-sm focus:outline-none focus:border-neon font-mono"
        />
        <p className="text-xs text-ash">Default is http://localhost:11434. Only localhost endpoints are accepted.</p>
        {!isLocalOllamaEndpoint(config.endpoint) && (
          <p className="text-xs text-red-300">Use an http://localhost or http://127.0.0.1 endpoint with no path.</p>
        )}
      </div>

      {/* Model */}
      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-chalk">Model</h3>
        <select
          value={config.model ?? ''}
          onChange={(e) => handleModelChange(e.target.value)}
          disabled={!status?.connected}
          className="w-full bg-raised border border-rim rounded-md px-3 py-2 text-chalk text-sm focus:outline-none focus:border-neon disabled:opacity-50"
        >
          <option value="">{status?.connected ? '— select a model —' : 'Connect Ollama first'}</option>
          {(status?.models ?? []).map((m) => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>
      </div>

      <button
        onClick={handleDisable}
        className="text-xs text-ash hover:text-red-400 transition-colors cursor-pointer"
      >
        Disable AI assistance
      </button>
    </div>
  )
}
