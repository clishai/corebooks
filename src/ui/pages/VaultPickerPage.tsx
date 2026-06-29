import { useState, useEffect, useCallback } from 'react'
import type { VaultEntry } from '../../electron/vaultTypes'
import { UnlockVaultModal } from '../components/UnlockVaultModal'

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

export default function VaultPickerPage() {
  const [vaults, setVaults] = useState<VaultEntry[]>([])
  const [selectedPath, setSelectedPath] = useState<string | null>(null)
  const [showNew, setShowNew] = useState(false)
  const [newName, setNewName] = useState('')
  const [newDir, setNewDir] = useState('')
  const [creating, setCreating] = useState(false)
  const [opening, setOpening] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [skipFor30Days, setSkipFor30Days] = useState(false)
  const [unlockVault, setUnlockVault] = useState<{ name: string; path: string } | null>(null)

  useEffect(() => {
    window.electronAPI?.vault.list().then((list) => {
      setVaults(list)
      if (list.length > 0) setSelectedPath(list[0].path)
    }).catch(() => setVaults([]))
    // Pre-load the default base directory so it's ready when the form opens.
    window.electronAPI?.vault.getDefaultBase().then(setNewDir).catch(() => {})
  }, [])

  useEffect(() => {
    const unsubscribe = window.electronAPI?.vault.onReady(() => {
      window.location.reload()
    })
    return () => { unsubscribe?.() }
  }, [])

  const openVault = useCallback(async (vaultPath: string) => {
    setError(null)
    try {
      if (skipFor30Days) {
        await window.electronAPI?.vault.setSkipUntil(
          new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        )
      }
      const result = await window.electronAPI?.vault.select(vaultPath)
      if (result?.needsPassword) {
        const vault = vaults.find((v) => v.path === vaultPath)
        setUnlockVault({ name: vault?.name ?? vaultPath, path: vaultPath })
        return // Don't proceed — show unlock modal
      }
      // vault:ready fires → onReady callback → window.location.reload()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to open vault')
    }
  }, [skipFor30Days, vaults])

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (showNew) return
      if (vaults.length === 0) return
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSelectedPath((prev) => {
          const idx = prev ? vaults.findIndex((v) => v.path === prev) : -1
          return vaults[(idx + 1) % vaults.length].path
        })
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSelectedPath((prev) => {
          const idx = prev ? vaults.findIndex((v) => v.path === prev) : 0
          return vaults[(idx - 1 + vaults.length) % vaults.length].path
        })
      } else if (e.key === 'Enter' && selectedPath) {
        void openVault(selectedPath)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [vaults, selectedPath, showNew, openVault])

  async function handleCreate() {
    if (!newName.trim() || !newDir.trim()) return
    setCreating(true)
    setError(null)
    try {
      if (skipFor30Days) {
        await window.electronAPI?.vault.setSkipUntil(
          new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        )
      }
      await window.electronAPI?.vault.create(newName.trim(), newDir.trim())
      // vault:ready fires → onReady callback → window.location.reload()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create vault')
      setCreating(false)
    }
  }

  async function handleChooseDir() {
    const dir = await window.electronAPI?.vault.chooseDirectory()
    if (dir) setNewDir(dir)
  }

  async function handleOpenExisting() {
    setOpening(true)
    setError(null)
    try {
      const dir = await window.electronAPI?.vault.chooseDirectory()
      if (!dir) { setOpening(false); return }
      if (skipFor30Days) {
        await window.electronAPI?.vault.setSkipUntil(
          new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        )
      }
      const result = await window.electronAPI?.vault.select(dir)
      if (result?.needsPassword) {
        const vault = vaults.find((v) => v.path === dir)
        setUnlockVault({ name: vault?.name ?? dir, path: dir })
        setOpening(false)
        return
      }
      // vault:ready fires → onReady callback → window.location.reload()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to open vault')
      setOpening(false)
    }
  }

  return (
    <div className="min-h-screen bg-base flex flex-col items-center justify-center px-6 py-12">
      <div className="w-full max-w-2xl">

        {/* Wordmark */}
        <div className="flex justify-center mb-10">
          <span className="font-mono font-light text-chalk text-2xl tracking-tight">~/ corebooks</span>
        </div>

        <h1 className="text-xl font-semibold text-chalk text-center mb-2">Open a vault</h1>
        <p className="text-sm text-ash text-center mb-8">
          Each vault is a folder on your machine containing a set of books.
        </p>

        {error && (
          <div className="mb-6 text-sm text-red-300 bg-red-950/50 border border-red-800 px-4 py-3 rounded-md">
            {error}
          </div>
        )}

        {/* Existing vaults */}
        {vaults.length > 0 && (
          <div className="grid gap-2 mb-6">
            {vaults.map((vault) => {
              const isSelected = selectedPath === vault.path
              return (
                <button
                  key={vault.path}
                  onClick={() => setSelectedPath(vault.path)}
                  onDoubleClick={() => void openVault(vault.path)}
                  className={`w-full text-left border rounded-lg px-5 py-4 transition-colors cursor-pointer group ${
                    isSelected
                      ? 'border-neon bg-neon/5'
                      : 'border-rim bg-surface hover:border-neon/40 hover:bg-raised'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className={`text-base font-semibold transition-colors ${isSelected ? 'text-neon' : 'text-chalk group-hover:text-neon'}`}>
                      {vault.name}
                    </span>
                    <div className="flex items-center gap-3">
                      <span className="text-[10px] text-ash border border-rim rounded px-1.5 py-0.5 uppercase tracking-wider">
                        open
                      </span>
                      <span className="text-xs text-ash">
                        Last opened {formatDate(vault.lastOpened)}
                      </span>
                    </div>
                  </div>
                  <div className="text-xs text-ash mt-1 truncate font-mono">{vault.path}</div>
                </button>
              )
            })}
          </div>
        )}

        {/* New vault form */}
        {showNew ? (
          <div className="bg-surface border border-rim rounded-xl px-5 py-5 mb-4">
            <h2 className="text-sm font-semibold text-chalk mb-4">Create a new vault</h2>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-chalk mb-1.5">Vault name</label>
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="My Business"
                  className="w-full bg-base border border-rim rounded-md px-3 py-2 text-sm text-chalk placeholder:text-ash focus:outline-none focus:border-neon transition-colors"
                  autoFocus
                  onKeyDown={(e) => { if (e.key === 'Enter') void handleCreate() }}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-chalk mb-1.5">Location</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newDir}
                    onChange={(e) => setNewDir(e.target.value)}
                    placeholder="/Users/you/Documents"
                    className="flex-1 bg-base border border-rim rounded-md px-3 py-2 text-sm text-chalk placeholder:text-ash focus:outline-none focus:border-neon transition-colors"
                  />
                  <button
                    onClick={() => void handleChooseDir()}
                    className="px-3 py-2 bg-raised border border-rim rounded-md text-xs text-ash hover:text-chalk hover:border-neon/50 transition-colors cursor-pointer"
                  >
                    Browse…
                  </button>
                </div>
              </div>
              <div className="flex gap-3 pt-1">
                <button
                  onClick={() => void handleCreate()}
                  disabled={!newName.trim() || !newDir.trim() || creating}
                  className="flex-1 bg-neon hover:bg-neon-dim text-void text-sm font-bold py-2 rounded-md transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {creating ? 'Creating…' : 'Create vault'}
                </button>
                <button
                  onClick={() => { setShowNew(false); setNewName(''); setNewDir('') }}
                  className="px-4 py-2 bg-raised border border-rim rounded-md text-sm text-ash hover:text-chalk hover:border-neon/50 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex gap-3">
            <button
              onClick={() => setShowNew(true)}
              className="flex-1 bg-neon hover:bg-neon-dim text-void text-sm font-bold py-2.5 rounded-md transition-colors cursor-pointer"
            >
              + New vault
            </button>
            <button
              onClick={() => void handleOpenExisting()}
              disabled={opening}
              className="flex-1 bg-surface border border-rim hover:border-neon/50 text-chalk text-sm font-medium py-2.5 rounded-md transition-colors cursor-pointer disabled:opacity-40"
            >
              {opening ? 'Opening…' : 'Open existing…'}
            </button>
          </div>
        )}

        {/* Skip preference — only shown when there are vaults to skip to */}
        {vaults.length > 0 && (
          <div className="flex items-center gap-2 mt-6 justify-center">
            <input
              type="checkbox"
              id="skip-30-days"
              checked={skipFor30Days}
              onChange={(e) => setSkipFor30Days(e.target.checked)}
              className="rounded border-rim accent-neon cursor-pointer"
            />
            <label htmlFor="skip-30-days" className="text-xs text-ash cursor-pointer select-none">
              Don&apos;t show this screen for 30 days
            </label>
          </div>
        )}

        {/* Keyboard hint */}
        {vaults.length > 0 && (
          <p className="text-[11px] text-ash/40 text-center mt-3">
            ↑↓ navigate · Enter or double-click to open
          </p>
        )}
      </div>

      {unlockVault && (
        <UnlockVaultModal
          vaultName={unlockVault.name}
          onSuccess={() => {
            setUnlockVault(null)
            // vault:ready will fire and the app will transition automatically
          }}
          onCancel={() => {
            setUnlockVault(null)
            setSelectedPath(null)
            setError(null)
          }}
        />
      )}
    </div>
  )
}
