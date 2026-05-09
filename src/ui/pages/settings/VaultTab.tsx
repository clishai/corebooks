import { useState } from 'react'

export default function VaultTab() {
  const vault = window.electronAPI?.vault
  const state = vault?.getState()
  const [name, setName] = useState(state?.vaultName ?? '')
  const [renaming, setRenaming] = useState(false)

  if (!vault || !state) {
    return (
      <div className="bg-surface border border-rim rounded-lg px-5 py-5 space-y-3">
        <h3 className="text-sm font-semibold text-chalk">Vaults are a desktop-only feature</h3>
        <p className="text-sm text-ash leading-relaxed">
          In the desktop app, every set of books lives in a <strong className="text-chalk">vault</strong> — a plain
          folder on your machine that you own and control. You pick which vault to open on every
          launch, and you can rename a vault directly from Settings (the folder renames on disk).
        </p>
        <p className="text-sm text-ash leading-relaxed">
          In web mode, corebooks connects to whichever database is configured via{' '}
          <code className="text-neon text-xs bg-raised px-1.5 py-0.5 rounded">DATABASE_URL</code>{' '}
          on the server. There is no vault picker because the database path is an infrastructure
          decision made by whoever deployed the server.
        </p>
        <p className="text-sm text-ash leading-relaxed">
          If you want local, transparent, file-system-based storage where you own every byte —
          the desktop app is what you want.
        </p>
      </div>
    )
  }

  async function handleRename() {
    if (!name.trim()) return
    setRenaming(true)
    try {
      await vault!.rename(name.trim())
      // main.ts calls app.relaunch() + app.exit(0) — app restarts
    } catch (e) {
      console.error(e)
      setRenaming(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-semibold text-chalk mb-3">Vault name</h3>
        <div className="flex gap-3">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') void handleRename() }}
            className="flex-1 bg-raised border border-rim rounded px-3 py-2 text-sm text-chalk focus:outline-none focus:border-neon/50"
          />
          <button
            onClick={handleRename}
            disabled={renaming || !name.trim() || name.trim() === state.vaultName}
            className="px-4 py-2 bg-neon hover:bg-neon-dim text-void text-sm font-semibold rounded transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {renaming ? 'Renaming…' : 'Rename'}
          </button>
        </div>
        {renaming ? (
          <p className="text-xs text-neon mt-2">
            Renaming folder on disk and restarting — the app will reopen in a moment.
          </p>
        ) : (
          <p className="text-xs text-ash mt-2">
            Renaming the vault renames the folder on disk and restarts the app.
          </p>
        )}
      </div>

      <div>
        <h3 className="text-sm font-semibold text-chalk mb-2">Vault location</h3>
        <div className="flex items-center gap-3">
          <span className="flex-1 text-sm text-ash truncate font-mono">{state.vaultPath}</span>
          <button
            onClick={() => void vault.showInExplorer()}
            className="px-3 py-1.5 bg-raised border border-rim rounded text-xs text-ash hover:text-chalk hover:border-neon/50 transition-colors cursor-pointer whitespace-nowrap"
          >
            Show in Finder
          </button>
        </div>
      </div>

      <div>
        <h3 className="text-sm font-semibold text-chalk mb-2">Switch vault</h3>
        <p className="text-sm text-ash mb-3">
          Close the current vault and return to the vault picker.
        </p>
        <button
          onClick={() => void vault.relaunch()}
          className="px-4 py-2 bg-raised border border-rim rounded text-sm text-ash hover:text-chalk hover:border-neon/50 transition-colors cursor-pointer"
        >
          Switch vault…
        </button>
      </div>
    </div>
  )
}
