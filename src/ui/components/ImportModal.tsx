import { useState, useRef } from 'react'
import { api, ImportMapping, ImportOptions, ImportResult } from '../api/client'

type Format = 'corebooks-json' | 'csv' | 'iif'
type Step = 'format-upload' | 'column-mapping' | 'options' | 'result'

// Parses the first row of a CSV text to extract column headers.
// Handles basic quoted fields — sufficient for header detection.
function extractCSVHeaders(text: string): string[] {
  const firstLine = text.split(/\r?\n/)[0] ?? ''
  const headers: string[] = []
  let field = ''
  let inQuotes = false
  for (let i = 0; i < firstLine.length; i++) {
    const ch = firstLine[i]!
    const next = firstLine[i + 1]
    if (inQuotes) {
      if (ch === '"' && next === '"') { field += '"'; i++ }
      else if (ch === '"') { inQuotes = false }
      else { field += ch }
    } else {
      if (ch === '"') { inQuotes = true }
      else if (ch === ',') { headers.push(field.trim()); field = '' }
      else { field += ch }
    }
  }
  headers.push(field.trim())
  return headers.filter((h) => h.length > 0)
}

// Preset column name mappings for common accounting software
const PRESETS: Record<string, Partial<ImportMapping>> = {
  'QuickBooks Online': {
    date: 'Journal Date',
    account: 'Account Name',
    debit: 'Debits',
    credit: 'Credits',
    memo: 'Description',
    reference: 'Ref Number',
  },
  'Xero': {
    date: 'Date',
    account: 'Account',
    debit: 'Debit',
    credit: 'Credit',
    memo: 'Description',
  },
  'Wave': {
    date: 'Date',
    account: 'Account Name',
    debit: 'Debit Amount',
    credit: 'Credit Amount',
    memo: 'Description',
  },
}

const EMPTY_MAPPING: ImportMapping = { date: '', account: '', debit: '', credit: '' }

interface Props {
  onClose: () => void
  onImported: () => void
}

export default function ImportModal({ onClose, onImported }: Props) {
  const [step, setStep] = useState<Step>('format-upload')
  const [format, setFormat] = useState<Format>('corebooks-json')
  const [fileText, setFileText] = useState('')
  const [fileName, setFileName] = useState('')
  const [csvHeaders, setCsvHeaders] = useState<string[]>([])
  const [mapping, setMapping] = useState<ImportMapping>(EMPTY_MAPPING)
  const [options, setOptions] = useState<ImportOptions>({
    createMissingAccounts: true,
    importAs: 'draft',
  })
  const [result, setResult] = useState<ImportResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setFileName(file.name)

    // Auto-detect format from extension
    if (file.name.endsWith('.json')) setFormat('corebooks-json')
    else if (file.name.endsWith('.iif')) setFormat('iif')
    else setFormat('csv')

    const reader = new FileReader()
    reader.onload = (ev) => {
      const text = (ev.target?.result as string) ?? ''
      setFileText(text)
      if (file.name.endsWith('.csv') || (!file.name.endsWith('.json') && !file.name.endsWith('.iif'))) {
        setCsvHeaders(extractCSVHeaders(text))
      }
    }
    reader.readAsText(file)
  }

  function handleFormatChange(f: Format) {
    setFormat(f)
    setMapping(EMPTY_MAPPING)
    setCsvHeaders(fileText ? extractCSVHeaders(fileText) : [])
  }

  function handleNext() {
    if (step === 'format-upload') {
      if (format === 'csv') { setStep('column-mapping'); return }
      setStep('options')
    } else if (step === 'column-mapping') {
      setStep('options')
    }
  }

  function applyPreset(name: string) {
    const preset = PRESETS[name]
    if (preset) setMapping((prev) => ({ ...prev, ...preset }))
  }

  function updateMapping(field: keyof ImportMapping, value: string) {
    setMapping((prev) => ({ ...prev, [field]: value }))
  }

  async function handleImport() {
    setLoading(true)
    setError(null)
    try {
      const res = await api.settings.import({
        format,
        data: fileText,
        mapping: format === 'csv' ? mapping : undefined,
        options,
      })
      setResult(res)
      setStep('result')
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Import failed.')
    } finally {
      setLoading(false)
    }
  }

  function handleDone() {
    onImported()
    onClose()
  }

  const canProceedFromUpload = fileText.trim().length > 0
  const canProceedFromMapping =
    mapping.date.trim() !== '' &&
    mapping.account.trim() !== '' &&
    (mapping.debit.trim() !== '' || mapping.credit.trim() !== '')

  const inputClass =
    'w-full bg-raised border border-rim rounded-md px-3 py-2 text-chalk text-sm focus:outline-none focus:border-neon'
  const selectClass =
    'w-full bg-raised border border-rim rounded-md px-3 py-2 text-chalk text-sm focus:outline-none focus:border-neon'

  function MappingRow({
    label,
    field,
    required,
  }: {
    label: string
    field: keyof ImportMapping
    required?: boolean
  }) {
    return (
      <div className="flex items-center gap-3">
        <span className="text-sm text-ash w-36 shrink-0">
          {label}
          {required && <span className="text-red-400 ml-0.5">*</span>}
        </span>
        <select
          value={mapping[field] ?? ''}
          onChange={(e) => updateMapping(field, e.target.value)}
          className={selectClass}
        >
          <option value="">— not mapped —</option>
          {csvHeaders.map((h) => (
            <option key={h} value={h}>{h}</option>
          ))}
        </select>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-surface border border-rim rounded-xl shadow-2xl w-full max-w-lg">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-rim">
          <h2 className="text-base font-semibold text-chalk">Import Data</h2>
          <button
            onClick={onClose}
            className="text-ash hover:text-chalk transition-colors text-lg leading-none"
          >
            ✕
          </button>
        </div>

        <div className="px-6 py-5 space-y-5">

          {/* ── Step 1: Format + Upload ── */}
          {step === 'format-upload' && (
            <>
              <div className="space-y-2">
                <p className="text-sm font-medium text-chalk">Select format</p>
                <div className="flex gap-2 flex-wrap">
                  {(['corebooks-json', 'csv', 'iif'] as Format[]).map((f) => (
                    <button
                      key={f}
                      onClick={() => handleFormatChange(f)}
                      className={`px-3 py-1.5 text-xs font-medium rounded-md border transition-colors ${
                        format === f
                          ? 'bg-neon/10 border-neon text-neon'
                          : 'border-rim text-ash hover:text-chalk hover:border-chalk/30'
                      }`}
                    >
                      {f === 'corebooks-json' ? 'corebooks JSON' : f === 'csv' ? 'Generic CSV' : 'QuickBooks IIF'}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-ash leading-relaxed">
                  {format === 'corebooks-json' &&
                    'Import a corebooks JSON backup. Accounts are matched by number; new ones are created.'}
                  {format === 'csv' &&
                    'Import a flat-format CSV (one line per row). Works with QuickBooks Online, Xero, Wave, and most accounting software.'}
                  {format === 'iif' &&
                    'Import a QuickBooks Desktop IIF file. TRNS/SPL blocks are parsed directly into journal entries.'}
                </p>
              </div>

              <div className="space-y-2">
                <p className="text-sm font-medium text-chalk">Choose file</p>
                <div
                  onClick={() => fileRef.current?.click()}
                  className="border border-dashed border-rim rounded-lg px-5 py-8 flex flex-col items-center gap-2 cursor-pointer hover:border-neon/50 hover:bg-neon/5 transition-colors"
                >
                  <span className="text-2xl text-ash">↑</span>
                  <span className="text-sm text-chalk">Click to browse</span>
                  {fileName && (
                    <span className="text-xs text-neon font-medium">{fileName}</span>
                  )}
                </div>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".json,.csv,.iif,.txt"
                  className="hidden"
                  onChange={handleFileChange}
                />
              </div>

              {error && (
                <p className="text-xs text-red-400">{error}</p>
              )}
            </>
          )}

          {/* ── Step 2: Column Mapping (CSV only) ── */}
          {step === 'column-mapping' && (
            <>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-chalk">Map columns</p>
                  <div className="flex gap-1.5">
                    {Object.keys(PRESETS).map((name) => (
                      <button
                        key={name}
                        onClick={() => applyPreset(name)}
                        className="text-xs text-neon border border-neon/30 hover:border-neon/60 px-2 py-1 rounded transition-colors"
                      >
                        {name}
                      </button>
                    ))}
                  </div>
                </div>
                <p className="text-xs text-ash">
                  Match each corebooks field to the corresponding column in your CSV.
                  Use the preset buttons to auto-fill for common accounting software.
                </p>
              </div>

              {csvHeaders.length === 0 ? (
                <p className="text-sm text-ash">No headers detected. Check that your file is a valid CSV.</p>
              ) : (
                <div className="space-y-2.5">
                  <MappingRow label="Date" field="date" required />
                  <MappingRow label="Account name" field="account" required />
                  <MappingRow label="Debit amount" field="debit" required />
                  <MappingRow label="Credit amount" field="credit" required />
                  <MappingRow label="Memo / description" field="memo" />
                  <MappingRow label="Entry reference" field="reference" />
                  <MappingRow label="Payment method" field="paymentMethod" />
                </div>
              )}

              <p className="text-xs text-ash leading-relaxed">
                <span className="text-chalk font-medium">Entry reference</span> groups rows into journal entries
                (e.g. "JE-001"). Without it, rows are auto-grouped by running balance.
              </p>
            </>
          )}

          {/* ── Step 3: Options ── */}
          {step === 'options' && (
            <>
              <div className="space-y-4">
                <p className="text-sm font-medium text-chalk">Import options</p>

                <label
                  onClick={() =>
                    setOptions((prev) => ({ ...prev, createMissingAccounts: !prev.createMissingAccounts }))
                  }
                  className="flex items-start gap-3 cursor-pointer"
                >
                  <div
                    className={`w-4 h-4 mt-0.5 rounded border flex items-center justify-center shrink-0 transition-colors ${
                      options.createMissingAccounts ? 'bg-neon border-neon' : 'border-rim bg-base'
                    }`}
                  >
                    {options.createMissingAccounts && (
                      <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                        <path d="M1 4L3.5 6.5L9 1" stroke="#0a0c12" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </div>
                  <div>
                    <p className="text-sm text-chalk">Create accounts that don&apos;t exist yet</p>
                    <p className="text-xs text-ash mt-0.5">
                      New accounts default to Asset type. You can edit them in the chart of accounts after importing.
                    </p>
                  </div>
                </label>

                <label
                  onClick={() =>
                    setOptions((prev) => ({
                      ...prev,
                      importAs: prev.importAs === 'posted' ? 'draft' : 'posted',
                    }))
                  }
                  className="flex items-start gap-3 cursor-pointer"
                >
                  <div
                    className={`w-4 h-4 mt-0.5 rounded border flex items-center justify-center shrink-0 transition-colors ${
                      options.importAs === 'posted' ? 'bg-neon border-neon' : 'border-rim bg-base'
                    }`}
                  >
                    {options.importAs === 'posted' && (
                      <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                        <path d="M1 4L3.5 6.5L9 1" stroke="#0a0c12" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </div>
                  <div>
                    <p className="text-sm text-chalk">Post entries immediately</p>
                    <p className="text-xs text-ash mt-0.5">
                      {options.importAs === 'posted'
                        ? 'Entries will be validated and posted. Any that fail validation are left as drafts.'
                        : 'Entries will be saved as drafts for you to review and post in the Drafts page.'}
                    </p>
                  </div>
                </label>
              </div>

              {error && (
                <div className="text-sm text-red-300 bg-red-950/50 border border-red-800 px-3 py-2 rounded-md">
                  {error}
                </div>
              )}
            </>
          )}

          {/* ── Step 4: Result ── */}
          {step === 'result' && result && (
            <div className="space-y-4">
              <div className="bg-emerald-950/50 border border-emerald-800 rounded-lg px-4 py-3 space-y-1">
                <p className="text-sm font-semibold text-emerald-300">Import complete</p>
                <p className="text-sm text-ash">
                  {result.entriesCreated} {result.entriesCreated === 1 ? 'entry' : 'entries'} imported
                  {options.importAs === 'posted' ? ' and posted' : ' as drafts'}.
                  {result.accountsCreated > 0 && ` ${result.accountsCreated} new account${result.accountsCreated !== 1 ? 's' : ''} created.`}
                  {result.accountsSkipped > 0 && ` ${result.accountsSkipped} existing account${result.accountsSkipped !== 1 ? 's' : ''} matched.`}
                  {result.entriesSkipped > 0 && ` ${result.entriesSkipped} ${result.entriesSkipped === 1 ? 'entry' : 'entries'} skipped.`}
                </p>
              </div>

              {result.warnings.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-xs font-semibold text-amber-400 uppercase tracking-wide">
                    {result.warnings.length} warning{result.warnings.length !== 1 ? 's' : ''}
                  </p>
                  <div className="bg-amber-950/30 border border-amber-800/50 rounded-lg px-4 py-3 max-h-48 overflow-y-auto space-y-1">
                    {result.warnings.map((w, i) => (
                      <p key={i} className="text-xs text-amber-300">{w}</p>
                    ))}
                  </div>
                </div>
              )}

              {options.importAs === 'draft' && result.entriesCreated > 0 && (
                <p className="text-xs text-ash">
                  Go to the <span className="text-chalk">Drafts</span> page to review and post your imported entries.
                </p>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-rim flex items-center justify-between">
          {step === 'result' ? (
            <div className="ml-auto">
              <button
                onClick={handleDone}
                className="bg-neon hover:bg-neon-dim text-void text-sm font-bold px-5 py-2 rounded-md transition-colors"
              >
                Done
              </button>
            </div>
          ) : (
            <>
              <button
                onClick={() => {
                  if (step === 'column-mapping') { setStep('format-upload'); return }
                  if (step === 'options') {
                    setStep(format === 'csv' ? 'column-mapping' : 'format-upload')
                    return
                  }
                  onClose()
                }}
                className="text-sm text-ash hover:text-chalk transition-colors"
              >
                {step === 'format-upload' ? 'Cancel' : '← Back'}
              </button>

              {step === 'options' ? (
                <button
                  onClick={handleImport}
                  disabled={loading}
                  className="bg-neon hover:bg-neon-dim disabled:opacity-50 text-void text-sm font-bold px-5 py-2 rounded-md transition-colors"
                >
                  {loading ? 'Importing…' : 'Import'}
                </button>
              ) : (
                <button
                  onClick={handleNext}
                  disabled={
                    (step === 'format-upload' && !canProceedFromUpload) ||
                    (step === 'column-mapping' && !canProceedFromMapping)
                  }
                  className="bg-neon hover:bg-neon-dim disabled:opacity-40 text-void text-sm font-bold px-5 py-2 rounded-md transition-colors"
                >
                  Next →
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
