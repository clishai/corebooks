// src/ui/pages/RecurringPage.tsx
import { useState, useEffect } from 'react'
import { listRecurringTemplates, deleteRecurringTemplate, type RecurringTemplate } from '../api/client'
import RecurringTemplateModal from '../components/RecurringTemplateModal'

export default function RecurringPage() {
  const [templates, setTemplates] = useState<RecurringTemplate[]>([])
  const [editTarget, setEditTarget] = useState<RecurringTemplate | null>(null)
  const [showModal, setShowModal] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    try {
      setTemplates(await listRecurringTemplates())
    } catch {
      setError('Failed to load recurring templates.')
    }
  }

  useEffect(() => { load() }, [])

  async function handleDelete(id: string) {
    if (!confirm('Delete this recurring template?')) return
    try {
      await deleteRecurringTemplate(id)
      load()
    } catch {
      setError('Failed to delete template.')
    }
  }

  return (
    <div className="max-w-3xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-chalk font-semibold text-lg">Recurring Transactions</h1>
        <button
          onClick={() => { setEditTarget(null); setShowModal(true) }}
          className="bg-neon hover:bg-neon-dim text-void text-xs font-semibold px-3 py-1.5 rounded-sm transition-colors"
        >
          + New Template
        </button>
      </div>

      {error && (
        <p className="text-red-400 text-sm mb-4">{error}</p>
      )}

      {!error && templates.length === 0 && (
        <p className="text-ash text-sm">No recurring templates yet. Create one to auto-generate entries on a schedule.</p>
      )}

      {templates.length > 0 && (
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b border-rim text-ash text-xs uppercase tracking-widest">
              <th className="text-left py-2 px-3 font-medium">Name</th>
              <th className="text-left py-2 px-3 font-medium">Schedule</th>
              <th className="text-left py-2 px-3 font-medium">Next Due</th>
              <th className="text-left py-2 px-3 font-medium">Auto-Post</th>
              <th className="py-2 px-3" />
            </tr>
          </thead>
          <tbody>
            {templates.map((t) => (
              <tr key={t.id} className="border-b border-rim/40 hover:bg-surface group">
                <td className="py-2 px-3 text-chalk">{t.name}</td>
                <td className="py-2 px-3 text-ash capitalize">{t.schedule}</td>
                <td className="py-2 px-3 text-ash">{new Date(t.nextDue).toLocaleDateString()}</td>
                <td className="py-2 px-3">
                  {t.autoPost
                    ? <span className="text-neon text-xs">Auto-post</span>
                    : <span className="text-ash text-xs">Draft</span>}
                </td>
                <td className="py-2 px-3 text-right">
                  <button
                    onClick={() => { setEditTarget(t); setShowModal(true) }}
                    className="text-ash hover:text-chalk text-xs mr-3 opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDelete(t.id)}
                    className="text-ash hover:text-red-400 text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {showModal && (
        <RecurringTemplateModal
          initial={editTarget}
          onClose={() => setShowModal(false)}
          onSaved={() => { setShowModal(false); load() }}
        />
      )}
    </div>
  )
}
