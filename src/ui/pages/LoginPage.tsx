import { useState } from 'react'
import { login, setupAdmin, setAuthToken } from '../lib/auth'

interface Props {
  needsSetup: boolean
  onSuccess: () => void
}

const inputClass =
  'w-full bg-base border border-rim rounded-md px-3 py-2 text-chalk placeholder:text-ash focus:outline-none focus:border-neon text-sm'

export default function LoginPage({ needsSetup, onSuccess }: Props) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (needsSetup && password !== confirm) {
      setError('Passwords do not match.')
      return
    }
    if (!email.trim() || !password) {
      setError('Email and password are required.')
      return
    }

    setLoading(true)
    try {
      if (needsSetup) {
        const result = await setupAdmin(email.trim(), password)
        setAuthToken(result.token)
      } else {
        const result = await login(email.trim(), password)
        setAuthToken(result.token)
      }
      onSuccess()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="h-screen bg-base flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold text-chalk lowercase">corebooks</h1>
          <p className="text-sm text-ash mt-2">
            {needsSetup ? 'Create your admin account to get started.' : 'Sign in to continue.'}
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="bg-surface border border-rim rounded-xl p-6 space-y-4"
        >
          {needsSetup && (
            <div className="bg-neon/5 border border-neon/20 rounded-lg px-4 py-3">
              <p className="text-xs text-ash leading-relaxed">
                corebooks is running in multi-user mode. Create an admin account to manage access
                for your team.
              </p>
            </div>
          )}

          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-chalk" htmlFor="email">
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className={inputClass}
              autoFocus
              autoComplete="email"
            />
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-chalk" htmlFor="password">
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className={inputClass}
              autoComplete={needsSetup ? 'new-password' : 'current-password'}
            />
          </div>

          {needsSetup && (
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-chalk" htmlFor="confirm">
                Confirm password
              </label>
              <input
                id="confirm"
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="••••••••"
                className={inputClass}
                autoComplete="new-password"
              />
            </div>
          )}

          {error && (
            <div className="text-sm text-red-300 bg-red-950/50 border border-red-800 px-3 py-2 rounded-md">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-neon hover:bg-neon-dim disabled:opacity-50 text-void text-sm font-bold py-2.5 rounded-md transition-colors"
          >
            {loading
              ? needsSetup
                ? 'Creating account…'
                : 'Signing in…'
              : needsSetup
                ? 'Create admin account'
                : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  )
}
