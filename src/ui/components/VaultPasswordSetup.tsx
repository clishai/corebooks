import { useState, useMemo } from 'react'

interface Props {
  /** Called after the user successfully completes setup + spot-check. */
  onComplete: () => void
  onCancel: () => void
}

type Step = 'password' | 'phrase' | 'verify'

function pickThreeIndices(): number[] {
  const indices = new Set<number>()
  while (indices.size < 3) {
    indices.add(Math.floor(Math.random() * 12))
  }
  return [...indices].sort((a, b) => a - b)
}

export default function VaultPasswordSetup({ onComplete, onCancel }: Props) {
  const vault = window.electronAPI?.vault

  const [step, setStep] = useState<Step>('password')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [phrase, setPhrase] = useState<string[]>([])
  const [checkIndices, setCheckIndices] = useState<number[]>([])
  const [checkInputs, setCheckInputs] = useState<Record<number, string>>({})
  const [checkError, setCheckError] = useState<string | null>(null)

  const passwordValid = useMemo(() => {
    return password.length >= 8 && password === confirm
  }, [password, confirm])

  async function handlePasswordSubmit() {
    if (!passwordValid || !vault) return
    setSubmitting(true)
    setError(null)
    try {
      const result = await vault.setupEncryption(password)
      setPhrase(result.phraseWords)
      setCheckIndices(pickThreeIndices())
      setCheckInputs({})
      setStep('phrase')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to set up encryption')
    } finally {
      setSubmitting(false)
    }
  }

  function handleVerifySubmit() {
    setCheckError(null)
    for (const idx of checkIndices) {
      const typed = (checkInputs[idx] ?? '').trim().toLowerCase()
      if (typed !== phrase[idx]) {
        setCheckError('One or more words did not match. Please review your written phrase and try again.')
        return
      }
    }
    onComplete()
  }

  return (
    <div className="fixed inset-0 bg-void/80 backdrop-blur-sm flex items-center justify-center z-50 p-6">
      <div className="bg-surface border border-rim rounded-lg w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="px-6 py-4 border-b border-rim flex items-center justify-between">
          <h2 className="text-base font-semibold text-chalk">Set vault password</h2>
          <button
            onClick={onCancel}
            className="text-ash hover:text-chalk text-sm cursor-pointer"
          >
            Cancel
          </button>
        </div>

        {step === 'password' && (
          <div className="px-6 py-6 space-y-4">
            <p className="text-sm text-ash leading-relaxed">
              A vault password protects your books with strong encryption. The password is required
              every time you open or export this vault. There is no recovery without your password
              or your 12-word recovery phrase.
            </p>
            <div>
              <label className="block text-xs font-semibold text-chalk mb-1">Password (min. 8 characters)</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoFocus
                className="w-full bg-raised border border-rim rounded px-3 py-2 text-sm text-chalk focus:outline-none focus:border-neon/50"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-chalk mb-1">Confirm password</label>
              <input
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && passwordValid) void handlePasswordSubmit() }}
                className="w-full bg-raised border border-rim rounded px-3 py-2 text-sm text-chalk focus:outline-none focus:border-neon/50"
              />
              {confirm.length > 0 && password !== confirm && (
                <p className="text-xs text-red-400 mt-1">Passwords do not match.</p>
              )}
            </div>
            {error && <p className="text-xs text-red-400">{error}</p>}
            <div className="flex justify-end">
              <button
                onClick={() => void handlePasswordSubmit()}
                disabled={!passwordValid || submitting}
                className="px-4 py-2 bg-neon hover:bg-neon-dim text-void text-sm font-semibold rounded transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {submitting ? 'Generating\u2026' : 'Continue \u2192'}
              </button>
            </div>
          </div>
        )}

        {step === 'phrase' && (
          <div className="px-6 py-6 space-y-4">
            <div className="bg-emerald-950/40 border border-emerald-700 rounded-lg px-4 py-3">
              <p className="text-sm text-emerald-300 font-medium">Write this on paper right now.</p>
              <p className="text-xs text-emerald-200/80 mt-1">
                Do not screenshot. Store it somewhere physically separate from your computer.
                Anyone with these 12 words can unlock this vault.
              </p>
            </div>
            <div
              className="grid grid-cols-3 gap-2"
              onCopy={(e) => e.preventDefault()}
              onCut={(e) => e.preventDefault()}
              style={{ userSelect: 'none' }}
            >
              {phrase.map((word, i) => (
                <div
                  key={i}
                  className="flex items-center gap-2 bg-raised border border-rim rounded px-3 py-2"
                >
                  <span className="text-xs text-ash font-mono w-5 text-right">{i + 1}.</span>
                  <span className="text-sm text-chalk font-mono">{word}</span>
                </div>
              ))}
            </div>
            <div className="flex justify-end">
              <button
                onClick={() => setStep('verify')}
                className="px-4 py-2 bg-neon hover:bg-neon-dim text-void text-sm font-semibold rounded transition-colors cursor-pointer"
              >
                I&apos;ve written it down \u2014 verify me \u2192
              </button>
            </div>
          </div>
        )}

        {step === 'verify' && (
          <div className="px-6 py-6 space-y-4">
            <p className="text-sm text-ash leading-relaxed">
              Type the words at the positions below to confirm you&apos;ve written the phrase down correctly.
              No copy/paste, no autocorrect \u2014 type them by hand from your paper backup.
            </p>
            <div className="space-y-3">
              {checkIndices.map((idx) => (
                <div key={idx} className="flex items-center gap-3">
                  <label className="text-sm text-chalk font-mono w-20 shrink-0">
                    Word #{idx + 1}
                  </label>
                  <input
                    type="text"
                    value={checkInputs[idx] ?? ''}
                    onChange={(e) => setCheckInputs((prev) => ({ ...prev, [idx]: e.target.value }))}
                    onPaste={(e) => e.preventDefault()}
                    autoComplete="off"
                    autoCorrect="off"
                    autoCapitalize="off"
                    spellCheck={false}
                    className="flex-1 bg-raised border border-rim rounded px-3 py-2 text-sm text-chalk font-mono focus:outline-none focus:border-neon/50"
                  />
                </div>
              ))}
            </div>
            {checkError && <p className="text-xs text-red-400">{checkError}</p>}
            <div className="flex justify-between">
              <button
                onClick={() => setStep('phrase')}
                className="px-4 py-2 bg-raised border border-rim rounded text-sm text-ash hover:text-chalk transition-colors cursor-pointer"
              >
                \u2190 Show phrase again
              </button>
              <button
                onClick={handleVerifySubmit}
                disabled={checkIndices.some((i) => !(checkInputs[i] ?? '').trim())}
                className="px-4 py-2 bg-neon hover:bg-neon-dim text-void text-sm font-semibold rounded transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Confirm
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
