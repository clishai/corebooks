import { useState, useMemo } from 'react'
import { wordlist } from '@scure/bip39/wordlists/english.js'

interface Props {
  /** Called after the recovery phrase verifies and the new password is set. */
  onComplete: () => void
  onCancel: () => void
}

function normalize(word: string): string {
  return word.toLowerCase().trim()
}

function isKnownWord(word: string): boolean {
  return wordlist.includes(normalize(word))
}

export default function VaultRecoverModal({ onComplete, onCancel }: Props) {
  const vault = window.electronAPI?.vault

  const [words, setWords] = useState<string[]>(() => Array.from({ length: 12 }, () => ''))
  const [newPassword, setNewPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const allWordsKnown = useMemo(() => {
    return words.every((w) => w.trim().length > 0 && isKnownWord(w))
  }, [words])

  const passwordValid = useMemo(() => {
    return newPassword.length >= 8 && newPassword === confirm
  }, [newPassword, confirm])

  function updateWord(index: number, value: string): void {
    setWords((prev) => {
      const next = [...prev]
      next[index] = value
      return next
    })
  }

  async function handleSubmit() {
    if (!vault || !allWordsKnown || !passwordValid) return
    setSubmitting(true)
    setError(null)
    try {
      const normalized = words.map(normalize)
      await vault.resetPasswordAfterRecovery(normalized, newPassword)
      onComplete()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Recovery failed')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-void/80 backdrop-blur-sm flex items-center justify-center z-50 p-6">
      <div className="bg-surface border border-rim rounded-lg w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="px-6 py-4 border-b border-rim flex items-center justify-between">
          <h2 className="text-base font-semibold text-chalk">Recover with 12-word phrase</h2>
          <button
            onClick={onCancel}
            disabled={submitting}
            className="text-ash hover:text-chalk text-sm cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Cancel
          </button>
        </div>

        <div className="px-6 py-6 space-y-4">
          <p className="text-sm text-ash leading-relaxed">
            Type each word from your written recovery phrase, in order. No copy/paste — type them
            by hand. Words turn red if they are not in the BIP-39 wordlist.
          </p>

          <div className="grid grid-cols-3 gap-2">
            {words.map((word, i) => {
              const trimmed = word.trim()
              const known = trimmed.length === 0 || isKnownWord(trimmed)
              return (
                <div key={i} className="flex items-center gap-2">
                  <span className="text-xs text-ash font-mono w-5 text-right">{i + 1}.</span>
                  <input
                    type="text"
                    value={word}
                    onChange={(e) => updateWord(i, e.target.value)}
                    onPaste={(e) => e.preventDefault()}
                    autoComplete="off"
                    autoCorrect="off"
                    autoCapitalize="off"
                    spellCheck={false}
                    className={`flex-1 bg-raised border rounded px-2 py-1.5 text-sm text-chalk font-mono focus:outline-none ${
                      known ? 'border-rim focus:border-neon/50' : 'border-red-500'
                    }`}
                  />
                </div>
              )
            })}
          </div>

          <hr className="border-rim" />

          <div>
            <label className="block text-xs font-semibold text-chalk mb-1">New password (min. 8 characters)</label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              autoComplete="new-password"
              className="w-full bg-raised border border-rim rounded px-3 py-2 text-sm text-chalk focus:outline-none focus:border-neon/50"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-chalk mb-1">Confirm new password</label>
            <input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="new-password"
              className="w-full bg-raised border border-rim rounded px-3 py-2 text-sm text-chalk focus:outline-none focus:border-neon/50"
            />
            {confirm.length > 0 && newPassword !== confirm && (
              <p className="text-xs text-red-400 mt-1">Passwords do not match.</p>
            )}
          </div>

          {error && <p className="text-xs text-red-400">{error}</p>}

          <div className="flex justify-end">
            <button
              onClick={() => void handleSubmit()}
              disabled={!allWordsKnown || !passwordValid || submitting}
              className="px-4 py-2 bg-neon hover:bg-neon-dim text-void text-sm font-semibold rounded transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {submitting ? 'Verifying…' : 'Recover vault'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
