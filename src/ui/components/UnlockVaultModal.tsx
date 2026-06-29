import { useState, useRef, useEffect } from 'react'

interface Props {
  vaultName: string
  onSuccess: () => void
  onCancel: () => void
}

export function UnlockVaultModal({ vaultName, onSuccess, onCancel }: Props) {
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (submitting || !password) return
    setSubmitting(true)
    setError(null)
    try {
      await window.electronAPI?.vault.unlock(password)
      onSuccess()
    } catch (e) {
      setError('Incorrect password. Please try again.')
      setPassword('')
      setSubmitting(false)
      inputRef.current?.focus()
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
      <div className="bg-surface border border-rim rounded-lg shadow-2xl w-full max-w-sm p-6 space-y-4">
        <div>
          <h2 className="text-base font-semibold text-chalk">Unlock vault</h2>
          <p className="text-sm text-ash mt-2">{vaultName}</p>
        </div>

        <form onSubmit={handleSubmit}>
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

          <div className="flex justify-end gap-3 pt-4">
            <button
              type="button"
              onClick={handleCancel}
              disabled={submitting}
              className="text-sm text-ash hover:text-chalk px-4 py-2 transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || !password}
              className="bg-neon text-void text-sm font-semibold px-4 py-2 rounded-md
                         hover:bg-neon-dim disabled:opacity-50 transition-colors"
            >
              {submitting ? 'Unlocking…' : 'Unlock'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
