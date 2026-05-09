import { useState } from 'react'
import { getPaymentMethods, savePaymentMethods } from '../../lib/paymentMethods'

export default function PaymentMethodsTab() {
  const [methods, setMethods] = useState<string[]>(getPaymentMethods)
  const [newMethod, setNewMethod] = useState('')
  const [error, setError] = useState<string | null>(null)

  function handleAdd() {
    const trimmed = newMethod.trim()
    if (!trimmed) return
    if (methods.includes(trimmed)) {
      setError('That payment method already exists.')
      return
    }
    const next = [...methods, trimmed]
    setMethods(next)
    savePaymentMethods(next)
    setNewMethod('')
    setError(null)
  }

  function handleRemove(method: string) {
    const next = methods.filter((m) => m !== method)
    setMethods(next)
    savePaymentMethods(next)
  }

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-chalk">Payment methods</h3>
        <p className="text-sm text-ash leading-relaxed">
          These appear as options in the journal entry form. Add or remove methods to match
          how your business actually moves money.
        </p>

        {methods.length > 0 ? (
          <div className="bg-surface border border-rim rounded-lg divide-y divide-rim">
            {methods.map((m) => (
              <div key={m} className="flex items-center justify-between px-5 py-3">
                <span className="text-sm text-chalk">{m}</span>
                <button
                  onClick={() => handleRemove(m)}
                  className="text-ash hover:text-red-400 text-xs transition-colors"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="bg-surface border border-rim rounded-lg px-5 py-4 text-sm text-ash">
            No payment methods yet. Add one below.
          </div>
        )}
      </div>

      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-chalk">Add a method</h3>
        <div className="flex gap-2">
          <input
            type="text"
            value={newMethod}
            onChange={(e) => { setNewMethod(e.target.value); setError(null) }}
            onKeyDown={(e) => { if (e.key === 'Enter') handleAdd() }}
            placeholder="e.g. Zelle, PayPal"
            className="flex-1 bg-raised border border-rim rounded-md px-3 py-2 text-chalk placeholder:text-ash focus:outline-none focus:border-neon text-sm"
          />
          <button
            onClick={handleAdd}
            className="px-4 py-2 text-sm font-medium rounded-md border border-neon/40 text-neon hover:bg-neon/10 transition-colors shrink-0"
          >
            Add
          </button>
        </div>
        {error && (
          <p className="text-xs text-red-400">{error}</p>
        )}
        <p className="text-xs text-ash">Changes take effect the next time you open the entry form.</p>
      </div>
    </div>
  )
}
