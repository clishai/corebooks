import { useState, useRef, useEffect } from 'react'
import type { OpenResult } from '../electron'

interface Props {
  vaultName: string
  vaultPath: string
  onSuccess: () => void
  onCancel: () => void
  /** Optional: when supplied, the modal exposes a "Forgot password" link that switches to recovery mode. */
  allowRecovery?: boolean
}

type Mode = 'password' | 'recovery'

export function UnlockVaultModal({ vaultName, vaultPath, onSuccess, onCancel, allowRecovery = true }: Props) {
  const [mode, setMode] = useState<Mode>('password')
  const [password, setPassword] = useState('')
  const [phrase, setPhrase] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (mode === 'password') {
      inputRef.current?.focus()
    } else {
      textareaRef.current?.focus()
    }
  }, [mode])

  function handleOpenResult(result: OpenResult | undefined) {
    if (!result) {
      setError('No response from vault service. Please try again.')
      return false
    }
    switch (result.status) {
      case 'opened':
        // main process will fire vault:ready → page reloads
        onSuccess()
        return true
      case 'needs-password':
        setError('Incorrect password. Please try again.')
        return false
      case 'busy':
        setError('This vault is already open in another window or process.')
        return false
      case 'identity-mismatch':
        setError('Vault identity check failed. The vault folder may have been moved or tampered with.')
        return false
      case 'lock-tampered':
        setError('Vault lock file is invalid. Please contact support before retrying.')
        return false
      case 'legacy-needs-migration':
        setError('This vault uses an older format and needs migration. Please use "Open existing…" on the picker.')
        return false
      case 'needs-settings-confirmation':
        setError('This vault has pending settings to confirm. Please open it from the picker.')
        return false
    }
  }

  async function handlePasswordSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (submitting || !password) return
    setSubmitting(true)
    setError(null)
    try {
      const result = await window.electronAPI?.vault.open({ path: vaultPath, password })
      const ok = handleOpenResult(result)
      if (!ok) {
        setPassword('')
        inputRef.current?.focus()
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to unlock vault')
      setPassword('')
      inputRef.current?.focus()
    } finally {
      setSubmitting(false)
    }
  }

  async function handleRecoverySubmit(e: React.FormEvent) {
    e.preventDefault()
    if (submitting) return
    const words = phrase.trim().split(/\s+/)
    if (words.length !== 12) {
      setError('Recovery phrase must be exactly 12 words.')
      return
    }
    if (newPassword.length < 8) {
      setError('New password must be at least 8 characters.')
      return
    }
    if (newPassword !== confirmPassword) {
      setError('New passwords do not match.')
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      const result = await window.electronAPI?.vault.unlockWithRecovery({
        path: vaultPath,
        phrase: words.join(' '),
        newPassword,
      })
      const ok = handleOpenResult(result)
      if (!ok) {
        setPhrase('')
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Recovery failed')
    } finally {
      setSubmitting(false)
    }
  }

  function handleCancel() {
    if (submitting) return
    onCancel()
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'Escape' && !submitting) {
      handleCancel()
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onKeyDown={handleKeyDown}
      role="presentation"
    >
      <div className="bg-surface border border-rim rounded-lg shadow-2xl w-full max-w-md p-6 space-y-4">
        <div>
          <h2 className="text-base font-semibold text-chalk">
            {mode === 'password' ? 'Unlock vault' : 'Recover vault'}
          </h2>
          <p className="text-sm text-ash mt-2">{vaultName}</p>
        </div>

        {mode === 'password' ? (
          <form onSubmit={handlePasswordSubmit}>
            <div className="space-y-2">
              <input
                ref={inputRef}
                type="password"
                autoComplete="current-password"
                placeholder="Vault password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={submitting}
                className="w-full bg-raised border border-rim text-chalk text-sm px-3 py-2 rounded-md
                           placeholder:text-ash/50 focus:outline-none focus:border-neon/60 disabled:opacity-50"
              />
              {error && (
                <div className="text-sm text-red-300 bg-red-950/50 border border-red-800 px-3 py-2 rounded-md">
                  {error}
                </div>
              )}
            </div>

            <div className="flex items-center justify-between pt-4">
              {allowRecovery ? (
                <button
                  type="button"
                  onClick={() => { setError(null); setMode('recovery') }}
                  disabled={submitting}
                  className="text-xs text-ash hover:text-neon transition-colors cursor-pointer disabled:opacity-50"
                >
                  Forgot password?
                </button>
              ) : <span />}

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={handleCancel}
                  disabled={submitting}
                  className="text-sm text-ash hover:text-chalk px-4 py-2 transition-colors disabled:opacity-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting || !password}
                  className="bg-neon text-void text-sm font-semibold px-4 py-2 rounded-md
                             hover:bg-neon-dim disabled:opacity-50 transition-colors cursor-pointer"
                >
                  {submitting ? 'Unlocking…' : 'Unlock'}
                </button>
              </div>
            </div>
          </form>
        ) : (
          <form onSubmit={handleRecoverySubmit}>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-chalk mb-1">12-word recovery phrase</label>
                <textarea
                  ref={textareaRef}
                  value={phrase}
                  onChange={(e) => setPhrase(e.target.value)}
                  placeholder="word1 word2 word3 …"
                  rows={3}
                  disabled={submitting}
                  spellCheck={false}
                  autoCapitalize="off"
                  autoCorrect="off"
                  className="w-full bg-raised border border-rim text-chalk text-sm font-mono px-3 py-2 rounded-md
                             placeholder:text-ash/50 focus:outline-none focus:border-neon/60 disabled:opacity-50"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-chalk mb-1">New password (min. 8 characters)</label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  autoComplete="new-password"
                  disabled={submitting}
                  className="w-full bg-raised border border-rim text-chalk text-sm px-3 py-2 rounded-md
                             focus:outline-none focus:border-neon/60 disabled:opacity-50"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-chalk mb-1">Confirm new password</label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  autoComplete="new-password"
                  disabled={submitting}
                  className="w-full bg-raised border border-rim text-chalk text-sm px-3 py-2 rounded-md
                             focus:outline-none focus:border-neon/60 disabled:opacity-50"
                />
              </div>
              {error && (
                <div className="text-sm text-red-300 bg-red-950/50 border border-red-800 px-3 py-2 rounded-md">
                  {error}
                </div>
              )}
            </div>

            <div className="flex items-center justify-between pt-4">
              <button
                type="button"
                onClick={() => { setError(null); setMode('password') }}
                disabled={submitting}
                className="text-xs text-ash hover:text-neon transition-colors cursor-pointer disabled:opacity-50"
              >
                ← Back to password
              </button>

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={handleCancel}
                  disabled={submitting}
                  className="text-sm text-ash hover:text-chalk px-4 py-2 transition-colors disabled:opacity-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting || !phrase || !newPassword || !confirmPassword}
                  className="bg-neon text-void text-sm font-semibold px-4 py-2 rounded-md
                             hover:bg-neon-dim disabled:opacity-50 transition-colors cursor-pointer"
                >
                  {submitting ? 'Recovering…' : 'Recover vault'}
                </button>
              </div>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
