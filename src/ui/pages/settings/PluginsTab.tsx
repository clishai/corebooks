import { useEffect, useState } from 'react'
import { api, type PluginCategory } from '../../api/client'

export default function PluginsTab() {
  const [categories, setCategories] = useState<PluginCategory[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api.plugins.categories().then(setCategories).catch((e: unknown) =>
      setError(e instanceof Error ? e.message : 'Failed to load plugin categories.'),
    )
  }, [])

  async function toggle(category: PluginCategory): Promise<void> {
    try {
      const updated = await api.plugins.setCategoryEnabled(category.id, !category.enabled)
      setCategories((current) => current.map((item) => item.id === updated.id ? updated : item))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update plugin category.')
    }
  }

  return (
    <div className="space-y-5 max-w-3xl">
      <div className="bg-surface border border-rim rounded-sm px-5 py-4">
        <h3 className="text-sm font-semibold text-chalk mb-1">Plugin catalog foundations</h3>
        <p className="text-sm text-ash leading-relaxed">
          Plugins are optional. Categories stay disabled until you choose to use them, and
          plugin work should create source documents or drafts by default — not posted entries.
        </p>
      </div>
      {error && <p className="text-sm text-red-300">{error}</p>}
      <div className="grid gap-3">
        {categories.map((category) => (
          <div key={category.id} className="bg-surface border border-rim rounded-sm px-5 py-4 flex gap-4">
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <h4 className="text-sm font-semibold text-chalk">{category.name}</h4>
                <span className={`text-[10px] uppercase tracking-wider ${category.enabled ? 'text-neon' : 'text-ash'}`}>
                  {category.enabled ? 'enabled' : 'disabled'}
                </span>
              </div>
              <p className="text-sm text-ash mt-1 leading-relaxed">{category.description}</p>
              <p className="text-xs text-ash/70 mt-2">Permissions: {category.permissions.join(', ')}</p>
            </div>
            <button
              onClick={() => void toggle(category)}
              className="self-start px-3 py-1.5 border border-rim rounded-sm text-xs text-ash hover:text-chalk hover:border-neon/50 transition-colors cursor-pointer"
            >
              {category.enabled ? 'Disable' : 'Enable'}
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
