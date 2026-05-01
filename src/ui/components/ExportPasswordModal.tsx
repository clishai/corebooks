import { useState } from 'react'

interface Props {
  onEncrypt: (passphrase: string) => void
  onCancel: () => void
  error: string | null
  loading: boolean
}

export default function ExportPasswordModal({ onEncrypt, onCancel, error, loading }: Props) {
  const [pass, setPass] = useState('')
  const [confirm, setConfirm] = useState('')
  const [validationError, setValidationError] = useState<string | null>(null)

  function handleSubmit() {
    if (!pass) {
      setValidationError('Enter a passphrase.')
      return
    }
    if (pass.length < 8) {
      setValidationError('Passphrase must be at least 8 characters.')
      return
    }
    if (pass !== confirm) {
      setValidationError('Passphrases do not match.')
      return
    }
    setValidationError(null)
    onEncrypt(pass)
  }

  const displayError = validationError ?? error

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-surface border border-rim rounded-xl shadow-2xl w-full max-w-sm p-6 space-y-4">

        <div>
          <h2 className="text-base font-semibold text-chalk">Encrypted export</h2>
          <p className="text-sm text-ash mt-2 leading-relaxed">
            Your export will be encrypted with AES-256-GCM. You will need this exact
            passphrase to restore your data — there is no recovery option if you forget it.
          </p>
        </div>

        <div className="space-y-2">
          <input
            type="password"
            placeholder="Passphrase"
            value={pass}
            onChange={e => setPass(e.target.value)}
            autoFocus
            disabled={loading}
            className="w-full bg-raised border border-rim text-chalk text-sm px-3 py-2 rounded-md
                       focus:outline-none focus:border-neon/60 disabled:opacity-50 placeholder:text-ash/50"
          />
          <input
            type="password"
            placeholder="Confirm passphrase"
            value={confirm}
            onChange={e => setConfirm(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !loading && handleSubmit()}
            disabled={loading}
            className="w-full bg-raised border border-rim text-chalk text-sm px-3 py-2 rounded-md
                       focus:outline-none focus:border-neon/60 disabled:opacity-50 placeholder:text-ash/50"
          />
        </div>

        {displayError && (
          <div className="text-sm text-red-300 bg-red-950/50 border border-red-800 px-3 py-2 rounded-md">
            {displayError}
          </div>
        )}

        <div className="flex justify-end gap-3 pt-1">
          <button
            onClick={onCancel}
            disabled={loading}
            className="text-sm text-ash hover:text-chalk px-4 py-2 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading}
            className="bg-neon text-void text-sm font-semibold px-4 py-2 rounded-md
                       hover:bg-neon-dim disabled:opacity-50 transition-colors"
          >
            {loading ? 'Encrypting…' : 'Encrypt & Download'}
          </button>
        </div>

      </div>
    </div>
  )
}
