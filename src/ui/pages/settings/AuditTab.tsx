import { useEffect, useState } from 'react'
import { api, type AuditEvent } from '../../api/client'

export default function AuditTab() {
  const [events, setEvents] = useState<AuditEvent[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api.audit.list(150).then(setEvents).catch((e: unknown) =>
      setError(e instanceof Error ? e.message : 'Failed to load audit log.'),
    )
  }, [])

  return (
    <div className="space-y-4 max-w-3xl">
      <div>
        <h3 className="text-sm font-semibold text-chalk">Audit log</h3>
        <p className="text-sm text-ash mt-1">Recent posting, backup, import, and reconciliation activity.</p>
      </div>
      {error && <p className="text-sm text-red-300">{error}</p>}
      <div className="bg-surface border border-rim rounded-sm divide-y divide-rim">
        {events.length === 0 ? (
          <p className="px-5 py-4 text-sm text-ash">No audit events yet.</p>
        ) : events.map((event) => (
          <div key={event.id} className="px-5 py-3">
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm text-chalk">{event.action}</span>
              <span className="text-xs text-ash">{new Date(event.createdAt).toLocaleString()}</span>
            </div>
            <p className="text-xs text-ash mt-1">
              {event.entityType}{event.entityId ? ` · ${event.entityId}` : ''}
            </p>
            {event.detail && (
              <pre className="mt-2 text-[10px] text-ash bg-void border border-rim rounded-sm p-2 overflow-auto">
                {JSON.stringify(event.detail, null, 2)}
              </pre>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
