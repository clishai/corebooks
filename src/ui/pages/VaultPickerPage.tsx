import { useState, useEffect } from 'react'
import logoSrc from '../assets/logo.png'
import type { VaultEntry } from '../../electron/vaultTypes'

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

export default function VaultPickerPage() {
  const [vaults, setVaults] = useState<VaultEntry[]>([])
  const [showNew, setShowNew] = useState(false)
  const [newName, setNewName] = useState('')
  const [newDir, setNewDir] = useState('')
  const [creating, setCreating] = useState(false)
  const [opening, setOpening] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    window.electronAPI?.vault.list().then(setVaults).catch(() => setVaults([]))
  }, [])

  useEffect(() => {
    window.electronAPI?.vault.onReady(() => {
      window.location.reload()
    })
  }, [])

  async function handleSelect(vaultPath: string) {
    setError(null)
    try {
      await window.electronAPI?.vault.select(vaultPath)
      // vault:ready fires → onReady callback → window.location.reload()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to open vault')
    }
  }

  async function handleCreate() {
    if (!newName.trim() || !newDir.trim()) return
    setCreating(true)
    setError(null)
    try {
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
      await window.electronAPI?.vault.select(dir)
      // vault:ready fires → onReady callback → window.location.reload()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to open vault')
      setOpening(false)
    }
  }

  return (
    <div className="min-h-screen bg-base flex flex-col items-center justify-center px-6 py-12">
      <div className="w-full max-w-2xl">
        {/* Logo */}
        <div className="flex justify-center mb-10">
          <img src={logoSrc} alt="corebooks" className="w-48" />
        </div>

        <h1 className="text-2xl font-semibold text-chalk text-center mb-2">Open a vault</h1>
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
          <div className="grid gap-3 mb-6">
            {vaults.map((vault) => (
              <button
                key={vault.path}
                onClick={() => handleSelect(vault.path)}
                className="w-full text-left bg-surface border border-rim rounded-lg px-5 py-4 hover:border-neon/50 hover:bg-raised transition-colors cursor-pointer group"
              >
                <div className="flex items-center justify-between">
                  <span className="text-base font-semibold text-chalk group-hover:text-neon transition-colors">
                    {vault.name}
                  </span>
                  <span className="text-xs text-ash">
                    Last opened {formatDate(vault.lastOpened)}
                  </span>
                </div>
                <div className="text-xs text-ash mt-1 truncate">{vault.path}</div>
              </button>
            ))}
          </div>
        )}

        {/* New vault form */}
        {showNew ? (
          <div className="bg-surface border border-rim rounded-lg px-5 py-5 mb-4">
            <h2 className="text-sm font-semibold text-chalk mb-4">Create a new vault</h2>
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-ash mb-1">Vault name</label>
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="My Business"
                  className="w-full bg-raised border border-rim rounded px-3 py-2 text-sm text-chalk placeholder-ash/40 focus:outline-none focus:border-neon/50"
                  autoFocus
                  onKeyDown={(e) => { if (e.key === 'Enter') void handleCreate() }}
                />
              </div>
              <div>
                <label className="block text-xs text-ash mb-1">Location</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newDir}
                    onChange={(e) => setNewDir(e.target.value)}
                    placeholder="/Users/you/Documents"
                    className="flex-1 bg-raised border border-rim rounded px-3 py-2 text-sm text-chalk placeholder-ash/40 focus:outline-none focus:border-neon/50"
                  />
                  <button
                    onClick={handleChooseDir}
                    className="px-3 py-2 bg-raised border border-rim rounded text-xs text-ash hover:text-chalk hover:border-neon/50 transition-colors cursor-pointer"
                  >
                    Browse…
                  </button>
                </div>
              </div>
              <div className="flex gap-3 pt-1">
                <button
                  onClick={handleCreate}
                  disabled={!newName.trim() || !newDir.trim() || creating}
                  className="flex-1 bg-neon hover:bg-neon-dim text-void text-sm font-semibold py-2 rounded transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {creating ? 'Creating…' : 'Create vault'}
                </button>
                <button
                  onClick={() => { setShowNew(false); setNewName(''); setNewDir('') }}
                  className="px-4 py-2 bg-raised border border-rim rounded text-sm text-ash hover:text-chalk transition-colors cursor-pointer"
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
              className="flex-1 bg-neon hover:bg-neon-dim text-void text-sm font-semibold py-2.5 rounded transition-colors cursor-pointer"
            >
              + New vault
            </button>
            <button
              onClick={handleOpenExisting}
              disabled={opening}
              className="flex-1 bg-surface border border-rim hover:border-neon/50 text-chalk text-sm font-medium py-2.5 rounded transition-colors cursor-pointer disabled:opacity-40"
            >
              {opening ? 'Opening…' : 'Open existing…'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
