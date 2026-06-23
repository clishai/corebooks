import { useState, useEffect, useCallback } from 'react'
import { api, JournalEntry } from '../api/client'
import NewEntryModal from '../components/NewEntryModal'
import Toast from '../components/Toast'
import BulkActionBar from '../components/BulkActionBar'

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

export default function DraftsPage() {
  const [drafts, setDrafts] = useState<JournalEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [openDraft, setOpenDraft] = useState<JournalEntry | null>(null)
  const [toastMessage, setToastMessage] = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function clearSelection() {
    setSelected(new Set())
  }

  const loadDrafts = useCallback(() => {
    setLoading(true)
    api.entries
      .listDrafts()
      .then(setDrafts)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Failed to load drafts.'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    loadDrafts()
  }, [loadDrafts])

  useEffect(() => {
    window.addEventListener('cb:drafts-changed', loadDrafts)
    return () => window.removeEventListener('cb:drafts-changed', loadDrafts)
  }, [loadDrafts])

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') clearSelection()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  async function handleDelete() {
    if (!deleteId) return
    setDeleting(true)
    try {
      await api.entries.delete(deleteId)
      setDrafts((prev) => prev.filter((d) => d.id !== deleteId))
      setDeleteId(null)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to delete draft.')
    } finally {
      setDeleting(false)
    }
  }

  function handleModalClose() {
    setOpenDraft(null)
    loadDrafts()
  }

  return (
    <div>
      <div className="mb-5">
        <h1 className="text-xl font-semibold text-chalk">Drafts</h1>
        <p className="text-sm text-ash mt-1">
          Unposted entries saved for later. Open a draft to continue editing or post it.
        </p>
      </div>

      {loading && <p className="text-sm text-ash">Loading…</p>}

      {error && (
        <div className="text-sm text-red-300 bg-red-950/50 border border-red-800 px-4 py-3 rounded-md mb-4">
          {error}
        </div>
      )}

      {!loading && !error && (
        <div className="bg-surface rounded-lg border border-rim overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-raised border-b border-rim">
                <th className="w-8" />
                <th className="text-left px-4 py-3 font-medium text-ash w-32">Date</th>
                <th className="text-left px-4 py-3 font-medium text-ash">Memo</th>
                <th className="text-right px-4 py-3 font-medium text-ash w-36">Actions</th>
              </tr>
            </thead>
            <tbody>
              {drafts.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-10 text-center text-ash text-sm">
                    No drafts. Start a new entry and use{' '}
                    <strong className="text-chalk">Save Draft</strong> to keep unfinished work.
                  </td>
                </tr>
              ) : (
                drafts.map((draft) => (
                  <tr
                    key={draft.id}
                    className="group border-b border-rim last:border-0 hover:bg-raised transition-colors"
                  >
                    <td className="py-2 px-2 w-8">
                      <input
                        type="checkbox"
                        checked={selected.has(draft.id ?? '')}
                        onChange={() => toggleSelect(draft.id ?? '')}
                        className="opacity-0 group-hover:opacity-100 checked:opacity-100 accent-neon transition-opacity"
                        onClick={(e) => e.stopPropagation()}
                      />
                    </td>
                    <td className="px-4 py-3 text-ash whitespace-nowrap">
                      {formatDate(draft.date)}
                    </td>
                    <td className="px-4 py-3 text-chalk">
                      {draft.memo || <span className="text-ash italic">No memo</span>}
                      {draft.paymentMethod ? (
                        <span className="ml-2 text-xs text-ash">{draft.paymentMethod}</span>
                      ) : (
                        <span className="ml-2 text-xs text-ash/50 italic">adjustment</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => setOpenDraft(draft)}
                          className="text-xs font-medium text-neon hover:text-neon-dim transition-colors px-2 py-1 rounded border border-neon/30 hover:border-neon/60"
                        >
                          Open
                        </button>
                        <button
                          onClick={() => setDeleteId(draft.id ?? null)}
                          className="text-xs font-medium text-ash hover:text-red-400 transition-colors px-2 py-1 rounded border border-rim hover:border-red-400/50"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      <BulkActionBar
        count={selected.size}
        onClear={clearSelection}
        actions={[
          {
            label: 'Post selected',
            onClick: async () => {
              const ids = Array.from(selected)
              for (const id of ids) {
                await api.entries.post(id)
              }
              clearSelection()
              loadDrafts()
            },
          },
          {
            label: 'Delete selected',
            destructive: true,
            onClick: async () => {
              if (!confirm(`Delete ${selected.size} draft(s)?`)) return
              const ids = Array.from(selected)
              for (const id of ids) {
                await api.entries.delete(id)
              }
              clearSelection()
              loadDrafts()
            },
          },
          {
            label: 'Export selected',
            onClick: () => {
              const selectedDrafts = drafts.filter((d) => selected.has(d.id ?? ''))
              const blob = new Blob([JSON.stringify(selectedDrafts, null, 2)], {
                type: 'application/json',
              })
              const url = URL.createObjectURL(blob)
              const a = document.createElement('a')
              a.href = url
              a.download = `drafts-export-${new Date().toISOString().slice(0, 10)}.json`
              a.click()
              URL.revokeObjectURL(url)
            },
          },
        ]}
      />

      {/* Delete confirmation modal */}
      {deleteId && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-surface border border-rim rounded-xl shadow-2xl w-full max-w-sm p-6">
            <h2 className="text-base font-semibold text-chalk mb-2">Delete draft?</h2>
            <p className="text-sm text-ash mb-6">
              Are you sure you want to delete this draft? This cannot be undone.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setDeleteId(null)}
                disabled={deleting}
                className="text-sm text-ash hover:text-chalk px-4 py-2 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="bg-red-700 hover:bg-red-600 disabled:opacity-50 text-white text-sm font-semibold px-4 py-2 rounded-md transition-colors"
              >
                {deleting ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {openDraft && (
        <NewEntryModal
          initialDraft={openDraft}
          onClose={handleModalClose}
          onPosted={handleModalClose}
          onAutoSaved={() => setToastMessage('Draft saved.')}
        />
      )}

      {toastMessage && (
        <Toast message={toastMessage} onDismiss={() => setToastMessage(null)} />
      )}
    </div>
  )
}
