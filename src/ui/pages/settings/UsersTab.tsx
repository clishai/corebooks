import { useState, useEffect } from 'react'
import { getAuthToken } from '../../lib/auth'

interface UserRecord {
  id: string
  email: string
  role: string
  createdAt: string
}

function authHeaders(): Record<string, string> {
  const token = getAuthToken()
  return token ? { Authorization: `Bearer ${token}` } : {}
}

async function fetchUsers(): Promise<UserRecord[]> {
  const res = await fetch('/auth/users', { headers: authHeaders() })
  if (!res.ok) throw new Error('Failed to load users.')
  return res.json() as Promise<UserRecord[]>
}

export default function UsersTab() {
  const [users, setUsers] = useState<UserRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [newEmail, setNewEmail] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [newRole, setNewRole] = useState<'Viewer' | 'Bookkeeper'>('Viewer')
  const [adding, setAdding] = useState(false)
  const [addError, setAddError] = useState<string | null>(null)
  const [promoteId, setPromoteId] = useState<string | null>(null)
  const [promotePassword, setPromotePassword] = useState('')
  const [promoting, setPromoting] = useState(false)
  const [promoteError, setPromoteError] = useState<string | null>(null)

  function loadUsers() {
    setLoading(true)
    fetchUsers()
      .then(setUsers)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Failed to load users.'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { loadUsers() }, [])

  async function handleAdd() {
    setAddError(null)
    if (!newEmail.trim() || !newPassword) {
      setAddError('Email and password are required.')
      return
    }
    setAdding(true)
    try {
      const res = await fetch('/auth/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ email: newEmail.trim(), password: newPassword, role: newRole }),
      })
      if (!res.ok) {
        const data = (await res.json()) as { error?: string }
        setAddError(data.error ?? 'Failed to create user.')
        return
      }
      setNewEmail('')
      setNewPassword('')
      setNewRole('Viewer')
      loadUsers()
    } catch {
      setAddError('Failed to create user.')
    } finally {
      setAdding(false)
    }
  }

  async function handleRemove(id: string) {
    if (!confirm('Remove this user? This cannot be undone.')) return
    try {
      const res = await fetch(`/auth/users/${id}`, {
        method: 'DELETE',
        headers: authHeaders(),
      })
      if (!res.ok) {
        const data = (await res.json()) as { error?: string }
        setError(data.error ?? 'Failed to remove user.')
        return
      }
      loadUsers()
    } catch {
      setError('Failed to remove user.')
    }
  }

  async function handlePromote() {
    if (!promoteId || !promotePassword) return
    setPromoteError(null)
    setPromoting(true)
    try {
      const res = await fetch(`/auth/users/${promoteId}/promote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ password: promotePassword }),
      })
      if (!res.ok) {
        const data = (await res.json()) as { error?: string }
        setPromoteError(data.error ?? 'Promotion failed.')
        return
      }
      setPromoteId(null)
      setPromotePassword('')
      loadUsers()
    } catch {
      setPromoteError('Promotion failed.')
    } finally {
      setPromoting(false)
    }
  }

  if (loading) return <p className="text-sm text-ash">Loading…</p>

  return (
    <div className="space-y-8">
      {error && (
        <div className="text-sm text-red-300 bg-red-950/50 border border-red-800 px-4 py-3 rounded-md">
          {error}
        </div>
      )}

      {/* User list */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-chalk">Team members</h3>
        {users.length === 0 ? (
          <p className="text-sm text-ash">No users yet.</p>
        ) : (
          <div className="bg-surface border border-rim rounded-lg divide-y divide-rim">
            {users.map((u) => (
              <div key={u.id} className="px-5 py-3">
                {promoteId === u.id ? (
                  <div className="space-y-2">
                    <p className="text-sm text-chalk">
                      Confirm your password to promote <strong>{u.email}</strong> to Admin.
                    </p>
                    <div className="flex gap-2">
                      <input
                        type="password"
                        value={promotePassword}
                        onChange={(e) => setPromotePassword(e.target.value)}
                        placeholder="Your password"
                        className="flex-1 bg-raised border border-rim rounded-md px-3 py-2 text-chalk placeholder:text-ash focus:outline-none focus:border-neon text-sm"
                      />
                      <button
                        onClick={handlePromote}
                        disabled={promoting}
                        className="px-3 py-2 text-sm font-medium rounded-md border border-neon/40 text-neon hover:bg-neon/10 disabled:opacity-50 transition-colors"
                      >
                        {promoting ? '…' : 'Confirm'}
                      </button>
                      <button
                        onClick={() => { setPromoteId(null); setPromotePassword(''); setPromoteError(null) }}
                        className="px-3 py-2 text-sm text-ash hover:text-chalk transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                    {promoteError && <p className="text-xs text-red-400">{promoteError}</p>}
                  </div>
                ) : (
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-sm text-chalk">{u.email}</span>
                      <span className={`ml-2 text-xs px-1.5 py-0.5 rounded font-medium ${
                        u.role === 'Admin'
                          ? 'bg-neon/10 text-neon'
                          : u.role === 'Bookkeeper'
                            ? 'bg-violet/10 text-violet'
                            : 'bg-raised text-ash'
                      }`}>
                        {u.role}
                      </span>
                    </div>
                    <div className="flex gap-3">
                      {u.role !== 'Admin' && (
                        <button
                          onClick={() => { setPromoteId(u.id); setPromotePassword('') }}
                          className="text-xs text-ash hover:text-neon transition-colors"
                        >
                          Make Admin
                        </button>
                      )}
                      <button
                        onClick={() => handleRemove(u.id)}
                        className="text-xs text-ash hover:text-red-400 transition-colors"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add user */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-chalk">Add a team member</h3>
        <p className="text-sm text-ash leading-relaxed">
          New users are created with limited access. Bookkeeper can create and post entries; Viewer
          can only read data.
        </p>
        <div className="flex gap-2 flex-wrap">
          <input
            type="email"
            value={newEmail}
            onChange={(e) => { setNewEmail(e.target.value); setAddError(null) }}
            placeholder="email@example.com"
            className="flex-1 min-w-40 bg-raised border border-rim rounded-md px-3 py-2 text-chalk placeholder:text-ash focus:outline-none focus:border-neon text-sm"
          />
          <input
            type="password"
            value={newPassword}
            onChange={(e) => { setNewPassword(e.target.value); setAddError(null) }}
            placeholder="password"
            className="flex-1 min-w-32 bg-raised border border-rim rounded-md px-3 py-2 text-chalk placeholder:text-ash focus:outline-none focus:border-neon text-sm"
          />
          <select
            value={newRole}
            onChange={(e) => setNewRole(e.target.value as 'Viewer' | 'Bookkeeper')}
            className="bg-raised border border-rim rounded-md px-3 py-2 text-chalk text-sm focus:outline-none focus:border-neon"
          >
            <option value="Viewer">Viewer</option>
            <option value="Bookkeeper">Bookkeeper</option>
          </select>
          <button
            onClick={handleAdd}
            disabled={adding}
            className="px-4 py-2 text-sm font-medium rounded-md border border-neon/40 text-neon hover:bg-neon/10 disabled:opacity-50 transition-colors shrink-0"
          >
            {adding ? 'Adding…' : 'Add'}
          </button>
        </div>
        {addError && <p className="text-xs text-red-400">{addError}</p>}
      </div>
    </div>
  )
}
