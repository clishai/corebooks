import { useState, useEffect, useCallback, useRef } from 'react'
import type { PickerEntry, OpenResult } from '../electron'
import { UnlockVaultModal } from '../components/UnlockVaultModal'

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

interface CreatedPhrase {
  phrase: string
  vaultName: string
}

export default function VaultPickerPage() {
  const [vaults, setVaults] = useState<PickerEntry[]>([])
  const [selectedPath, setSelectedPath] = useState<string | null>(null)
  const [showNew, setShowNew] = useState(false)
  const [newName, setNewName] = useState('')
  const [newDir, setNewDir] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [newPasswordConfirm, setNewPasswordConfirm] = useState('')
  const [creating, setCreating] = useState(false)
  const [opening, setOpening] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [unlockVault, setUnlockVault] = useState<{ name: string; path: string } | null>(null)
  const [confirmingSettings, setConfirmingSettings] = useState<{ path: string; password: string } | null>(null)
  const [legacyMigrate, setLegacyMigrate] = useState<{ name: string; path: string } | null>(null)
  const [legacyPassword, setLegacyPassword] = useState('')
  const [legacySubmitting, setLegacySubmitting] = useState(false)
  const [createdPhrase, setCreatedPhrase] = useState<CreatedPhrase | null>(null)
  // After the recovery phrase is acknowledged, this triggers the reload that
  // the vault:ready listener has been suppressing.
  const suppressReload = useRef(false)
  // Tracks whether vault:ready fired while suppressReload was active so that
  // handlePhraseAcknowledged knows whether to reload immediately or wait.
  const vaultReadySuppressed = useRef(false)

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
      if (suppressReload.current) {
        // A create flow is showing the recovery phrase — defer reload until
        // the user acknowledges it. Mark that we received the event so
        // handlePhraseAcknowledged can reload immediately.
        vaultReadySuppressed.current = true
        return
      }
      window.location.reload()
    })
    return () => { unsubscribe?.() }
  }, [])

  const handleOpenResult = useCallback(
    (result: OpenResult | undefined, vaultPath: string, attemptedPassword?: string): void => {
      if (!result) {
        setError('No response from vault service. Please try again.')
        return
      }
      switch (result.status) {
        case 'opened':
          // vault:ready listener will reload the page
          return
        case 'needs-password': {
          const v = vaults.find((x) => x.path === vaultPath)
          setUnlockVault({ name: v?.displayName ?? vaultPath, path: vaultPath })
          return
        }
        case 'needs-settings-confirmation':
          setConfirmingSettings({ path: vaultPath, password: attemptedPassword ?? '' })
          return
        case 'busy':
          setError(`Vault is already open in another process (pid ${result.lockedByPid}).`)
          return
        case 'identity-mismatch':
          setError('Vault identity check failed. The vault folder may have been moved or tampered with.')
          return
        case 'lock-tampered':
          setError('Vault lock file is invalid. Investigate before retrying.')
          return
        case 'legacy-needs-migration': {
          const v = vaults.find((x) => x.path === vaultPath)
          setLegacyMigrate({ name: v?.displayName ?? vaultPath, path: vaultPath })
          return
        }
      }
    },
    [vaults],
  )

  const openVault = useCallback(async (vaultPath: string): Promise<void> => {
    setError(null)
    setOpening(true)
    try {
      const result = await window.electronAPI?.vault.open({ path: vaultPath })
      handleOpenResult(result, vaultPath)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to open vault')
    } finally {
      setOpening(false)
    }
  }, [handleOpenResult])

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (showNew || unlockVault || legacyMigrate || createdPhrase || confirmingSettings) return
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
  }, [vaults, selectedPath, showNew, openVault, unlockVault, legacyMigrate, createdPhrase, confirmingSettings])

  const createValid =
    newName.trim().length > 0 &&
    newDir.trim().length > 0 &&
    newPassword.length >= 12 &&
    newPassword === newPasswordConfirm

  async function handleCreate(): Promise<void> {
    if (!createValid) return
    setCreating(true)
    setError(null)
    // Suppress the auto-reload from vault:ready until the user has copied the phrase.
    suppressReload.current = true
    try {
      const result = await window.electronAPI?.vault.create({
        directory: newDir.trim(),
        displayName: newName.trim(),
        password: newPassword,
      })
      if (!result) {
        suppressReload.current = false
        setError('Failed to create vault')
        return
      }
      setCreatedPhrase({ phrase: result.recoveryPhrase, vaultName: result.vault.displayName })
    } catch (e) {
      suppressReload.current = false
      setError(e instanceof Error ? e.message : 'Failed to create vault')
    } finally {
      setCreating(false)
    }
  }

  function handlePhraseAcknowledged(): void {
    setCreatedPhrase(null)
    suppressReload.current = false
    if (vaultReadySuppressed.current) {
      // vault:ready already fired while the phrase modal was showing — safe to reload now.
      window.location.reload()
    } else {
      // vault:ready hasn't arrived yet; wait for it then reload.
      const cleanup = window.electronAPI!.vault.onReady(() => {
        cleanup()
        window.location.reload()
      })
    }
  }

  async function handleChooseDir(): Promise<void> {
    const dir = await window.electronAPI?.vault.chooseDirectory()
    if (dir) setNewDir(dir)
  }

  async function handleOpenExisting(): Promise<void> {
    setOpening(true)
    setError(null)
    try {
      const dir = await window.electronAPI?.vault.chooseDirectory()
      if (!dir) { setOpening(false); return }
      const result = await window.electronAPI?.vault.open({ path: dir })
      handleOpenResult(result, dir)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to open vault')
    } finally {
      setOpening(false)
    }
  }

  async function handleConfirmSettings(): Promise<void> {
    if (!confirmingSettings) return
    const { path, password } = confirmingSettings
    setConfirmingSettings(null)
    setOpening(true)
    setError(null)
    try {
      await window.electronAPI?.vault.confirmDefaultSettings()
      const result = await window.electronAPI?.vault.open({ path, password: password || undefined })
      handleOpenResult(result, path, password)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to confirm settings')
    } finally {
      setOpening(false)
    }
  }

  async function handleMigrateLegacy(): Promise<void> {
    if (!legacyMigrate || !legacyPassword) return
    setLegacySubmitting(true)
    setError(null)
    try {
      const result = await window.electronAPI?.vault.migrateLegacy({
        path: legacyMigrate.path,
        password: legacyPassword,
      })
      if (!result) {
        setError('Migration failed')
        return
      }
      setLegacyMigrate(null)
      setLegacyPassword('')
      setCreatedPhrase({ phrase: result.recoveryPhrase, vaultName: legacyMigrate.name })
      // After phrase is acknowledged, the user can re-attempt open.
      suppressReload.current = true
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Migration failed')
    } finally {
      setLegacySubmitting(false)
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
                      {vault.displayName}
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
              <div>
                <label className="block text-xs font-medium text-chalk mb-1.5">Vault password (min. 12 characters)</label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  autoComplete="new-password"
                  className="w-full bg-base border border-rim rounded-md px-3 py-2 text-sm text-chalk focus:outline-none focus:border-neon transition-colors"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-chalk mb-1.5">Confirm password</label>
                <input
                  type="password"
                  value={newPasswordConfirm}
                  onChange={(e) => setNewPasswordConfirm(e.target.value)}
                  autoComplete="new-password"
                  onKeyDown={(e) => { if (e.key === 'Enter' && createValid) void handleCreate() }}
                  className="w-full bg-base border border-rim rounded-md px-3 py-2 text-sm text-chalk focus:outline-none focus:border-neon transition-colors"
                />
                {newPasswordConfirm.length > 0 && newPassword !== newPasswordConfirm && (
                  <p className="text-xs text-red-400 mt-1">Passwords do not match.</p>
                )}
              </div>
              <div className="flex gap-3 pt-1">
                <button
                  onClick={() => void handleCreate()}
                  disabled={!createValid || creating}
                  className="flex-1 bg-neon hover:bg-neon-dim text-void text-sm font-bold py-2 rounded-md transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {creating ? 'Creating…' : 'Create vault'}
                </button>
                <button
                  onClick={() => {
                    setShowNew(false)
                    setNewName('')
                    setNewDir('')
                    setNewPassword('')
                    setNewPasswordConfirm('')
                  }}
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
          vaultPath={unlockVault.path}
          onSuccess={() => {
            // vault:ready listener will reload the page
            setUnlockVault(null)
          }}
          onCancel={() => {
            setUnlockVault(null)
            setError(null)
          }}
        />
      )}

      {confirmingSettings && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-surface border border-rim rounded-lg shadow-2xl w-full max-w-md p-6 space-y-4">
            <h2 className="text-base font-semibold text-chalk">Confirm vault settings</h2>
            <p className="text-sm text-ash">
              This vault has pending default settings. Continue to apply them and finish opening the vault.
            </p>
            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={() => { setConfirmingSettings(null); setError(null) }}
                className="text-sm text-ash hover:text-chalk px-4 py-2 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={() => void handleConfirmSettings()}
                className="bg-neon text-void text-sm font-semibold px-4 py-2 rounded-md hover:bg-neon-dim transition-colors cursor-pointer"
              >
                Apply &amp; open
              </button>
            </div>
          </div>
        </div>
      )}

      {legacyMigrate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-surface border border-rim rounded-lg shadow-2xl w-full max-w-md p-6 space-y-4">
            <div>
              <h2 className="text-base font-semibold text-chalk">Migrate legacy vault</h2>
              <p className="text-sm text-ash mt-2">{legacyMigrate.name}</p>
            </div>
            <p className="text-sm text-ash leading-relaxed">
              This vault was created in an older version of corebooks and must be migrated before it can
              be opened. Enter the current vault password to perform a one-time migration. A new
              12-word recovery phrase will be generated.
            </p>
            <div>
              <label className="block text-xs font-semibold text-chalk mb-1">Current password</label>
              <input
                type="password"
                value={legacyPassword}
                onChange={(e) => setLegacyPassword(e.target.value)}
                autoComplete="current-password"
                disabled={legacySubmitting}
                autoFocus
                className="w-full bg-raised border border-rim text-chalk text-sm px-3 py-2 rounded-md focus:outline-none focus:border-neon/60 disabled:opacity-50"
              />
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={() => { setLegacyMigrate(null); setLegacyPassword(''); setError(null) }}
                disabled={legacySubmitting}
                className="text-sm text-ash hover:text-chalk px-4 py-2 transition-colors cursor-pointer disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={() => void handleMigrateLegacy()}
                disabled={legacySubmitting || !legacyPassword}
                className="bg-neon text-void text-sm font-semibold px-4 py-2 rounded-md hover:bg-neon-dim transition-colors cursor-pointer disabled:opacity-50"
              >
                {legacySubmitting ? 'Migrating…' : 'Migrate'}
              </button>
            </div>
          </div>
        </div>
      )}

      {createdPhrase && (
        <RecoveryPhraseModal
          vaultName={createdPhrase.vaultName}
          phrase={createdPhrase.phrase}
          onAcknowledge={handlePhraseAcknowledged}
        />
      )}
    </div>
  )
}

interface RecoveryPhraseModalProps {
  vaultName: string
  phrase: string
  onAcknowledge: () => void
}

function RecoveryPhraseModal({ vaultName, phrase, onAcknowledge }: RecoveryPhraseModalProps) {
  const words = phrase.trim().split(/\s+/)
  const [acknowledged, setAcknowledged] = useState(false)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-6">
      <div className="bg-surface border border-rim rounded-lg w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="px-6 py-4 border-b border-rim">
          <h2 className="text-base font-semibold text-chalk">Recovery phrase for {vaultName}</h2>
        </div>
        <div className="px-6 py-6 space-y-4">
          <div className="bg-emerald-950/40 border border-emerald-700 rounded-lg px-4 py-3">
            <p className="text-sm text-emerald-300 font-medium">Write this on paper right now.</p>
            <p className="text-xs text-emerald-200/80 mt-1">
              Do not screenshot. Store it somewhere physically separate from your computer.
              If you forget your password, these 12 words are the only way to recover your vault.
            </p>
          </div>
          <div
            className="grid grid-cols-3 gap-2"
            onCopy={(e) => e.preventDefault()}
            onCut={(e) => e.preventDefault()}
            onDragStart={(e) => e.preventDefault()}
            style={{ userSelect: 'none' }}
          >
            {words.map((word, i) => (
              <div key={i} className="flex items-center gap-2 bg-raised border border-rim rounded px-3 py-2">
                <span className="text-xs text-ash font-mono w-5 text-right">{i + 1}.</span>
                <span className="text-sm text-chalk font-mono">{word}</span>
              </div>
            ))}
          </div>
          <label className="flex items-center gap-2 text-sm text-ash cursor-pointer select-none">
            <input
              type="checkbox"
              checked={acknowledged}
              onChange={(e) => setAcknowledged(e.target.checked)}
              className="accent-neon cursor-pointer"
            />
            I&apos;ve written down all 12 words.
          </label>
          <div className="flex justify-end">
            <button
              onClick={onAcknowledge}
              disabled={!acknowledged}
              className="bg-neon text-void text-sm font-semibold px-4 py-2 rounded-md hover:bg-neon-dim transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Continue
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
