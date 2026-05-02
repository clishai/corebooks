import { useState, useEffect, Fragment } from 'react'
import { api, BalanceSheet, BalanceSheetSection } from '../api/client'

function fmt(amount: number): string {
  if (amount < 0) {
    return `(${Math.abs(amount).toLocaleString('en-US', { style: 'currency', currency: 'USD' })})`
  }
  return amount.toLocaleString('en-US', { style: 'currency', currency: 'USD' })
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10)
}

// ── Shared cell classes ──────────────────────────────────────────────────────

const colChevron = 'w-8 text-center pl-2'
const colNumber  = 'w-24 px-2 font-mono text-xs'
const colName    = 'px-2'
const colAmount  = 'w-44 px-3 text-right font-mono text-sm'

// ── Section group component ─────────────────────────────────────────────────

interface SectionGroupProps {
  label: string
  section: BalanceSheetSection
  expanded: boolean
  onToggle: () => void
  subtotalLabel: string
}

function SectionGroup({ label, section, expanded, onToggle, subtotalLabel }: SectionGroupProps) {
  const hasLines = section.lines.length > 0
  return (
    <Fragment>
      {/* Category header row */}
      <tr
        className={`border-b border-rim ${hasLines ? 'cursor-pointer hover:bg-raised/60' : ''} transition-colors`}
        onClick={hasLines ? onToggle : undefined}
      >
        <td className={`${colChevron} py-2.5 text-ash text-xs select-none`}>
          {hasLines ? (expanded ? '▾' : '▸') : ''}
        </td>
        <td className={`${colNumber} py-2.5 text-ash`}></td>
        <td className={`${colName} py-2.5 text-sm font-semibold text-chalk`}>{label}</td>
        <td className={`${colAmount} py-2.5 font-semibold ${section.total === 0 ? 'text-ash' : 'text-chalk'}`}>
          {section.total === 0 && !hasLines ? '—' : fmt(section.total)}
        </td>
      </tr>

      {/* Account detail rows */}
      {expanded && section.lines.map((line) => (
        <tr key={line.accountId} className="border-b border-rim/60 bg-void/40">
          <td className={`${colChevron} py-2`}></td>
          <td className={`${colNumber} py-2 text-ash/70`}>{line.accountNumber}</td>
          <td className={`${colName} py-2 pl-7 text-sm text-ash`}>{line.accountName}</td>
          <td className={`${colAmount} py-2 ${line.balance < 0 ? 'text-red-400' : 'text-chalk/90'}`}>
            {fmt(line.balance)}
          </td>
        </tr>
      ))}

      {/* Subtotal row (only shown when expanded and has lines) */}
      {expanded && hasLines && (
        <tr className="border-b border-rim">
          <td className={`${colChevron} py-2`}></td>
          <td className={`${colNumber} py-2`}></td>
          <td className={`${colName} py-2 pl-7 text-xs text-ash uppercase tracking-wide`}>{subtotalLabel}</td>
          <td className={`${colAmount} py-2 text-chalk font-semibold border-t border-rim`}>
            {fmt(section.total)}
          </td>
        </tr>
      )}
    </Fragment>
  )
}

// ── Statement table wrapper ──────────────────────────────────────────────────

function StatementTable({ children }: { children: React.ReactNode }) {
  return (
    <div className="border border-rim overflow-hidden rounded-sm">
      <table className="w-full text-sm border-collapse">
        {children}
      </table>
    </div>
  )
}

// ── Section header (ASSETS / LIABILITIES / EQUITY) ──────────────────────────

function SectionLabel({ label }: { label: string }) {
  return (
    <thead>
      <tr className="bg-void border-b border-rim">
        <th colSpan={4} className="px-3 py-2 text-left text-xs font-bold text-neon uppercase tracking-widest">
          {label}
        </th>
      </tr>
    </thead>
  )
}

// ── Grand total row ──────────────────────────────────────────────────────────

function GrandTotalRow({ label, amount }: { label: string; amount: number }) {
  return (
    <tr className="bg-raised border-t-2 border-rim">
      <td className={`${colChevron} py-3`}></td>
      <td className={`${colNumber} py-3`}></td>
      <td className={`${colName} py-3 text-sm font-bold text-chalk uppercase tracking-wide`}>{label}</td>
      <td className={`${colAmount} py-3 font-bold text-neon text-base`}>{fmt(amount)}</td>
    </tr>
  )
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function BalanceSheetPage() {
  const [asOf, setAsOf] = useState(todayISO())
  const [report, setReport] = useState<BalanceSheet | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [open, setOpen] = useState({
    ca:  true,  // current assets
    nca: true,  // non-current assets
    cl:  true,  // current liabilities
    ncl: true,  // non-current liabilities
    eq:  true,  // equity accounts
  })

  function toggle(key: keyof typeof open) {
    setOpen((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  function fetchReport(date: string) {
    setLoading(true)
    setError(null)
    api.reports
      .balanceSheet(date)
      .then(setReport)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Failed to load report.'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { fetchReport(asOf) }, [])

  function handleDateChange(e: React.ChangeEvent<HTMLInputElement>) {
    setAsOf(e.target.value)
    if (e.target.value) fetchReport(e.target.value)
  }

  return (
    <div>
      {/* Header + date picker */}
      <div className="flex flex-wrap items-start justify-between gap-4 mb-5">
        <div>
          <h1 className="text-xl font-semibold text-chalk">Balance Sheet</h1>
          <p className="text-sm text-ash mt-1">Assets, liabilities, and equity as of a date.</p>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs font-medium text-ash">As of</label>
          <input
            type="date"
            value={asOf}
            onChange={handleDateChange}
            className="bg-raised border border-rim text-chalk rounded-sm px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-neon"
          />
        </div>
      </div>

      {loading && <p className="text-sm text-ash">Loading…</p>}

      {error && (
        <div className="text-sm text-red-300 bg-red-950/50 border border-red-800 px-4 py-3 rounded-sm">
          {error}
        </div>
      )}

      {report && !loading && (
        <div className="space-y-3 max-w-2xl">

          {/* ── ASSETS ── */}
          <StatementTable>
            <SectionLabel label="Assets" />
            <tbody>
              <SectionGroup
                label="Current Assets"
                section={report.currentAssets}
                expanded={open.ca}
                onToggle={() => toggle('ca')}
                subtotalLabel="Total Current Assets"
              />
              <SectionGroup
                label="Non-current Assets"
                section={report.nonCurrentAssets}
                expanded={open.nca}
                onToggle={() => toggle('nca')}
                subtotalLabel="Total Non-current Assets"
              />
              <GrandTotalRow label="Total Assets" amount={report.assets} />
            </tbody>
          </StatementTable>

          {/* ── LIABILITIES ── */}
          <StatementTable>
            <SectionLabel label="Liabilities" />
            <tbody>
              <SectionGroup
                label="Current Liabilities"
                section={report.currentLiabilities}
                expanded={open.cl}
                onToggle={() => toggle('cl')}
                subtotalLabel="Total Current Liabilities"
              />
              <SectionGroup
                label="Non-current Liabilities"
                section={report.nonCurrentLiabilities}
                expanded={open.ncl}
                onToggle={() => toggle('ncl')}
                subtotalLabel="Total Non-current Liabilities"
              />
              <GrandTotalRow label="Total Liabilities" amount={report.liabilities} />
            </tbody>
          </StatementTable>

          {/* ── EQUITY ── */}
          <StatementTable>
            <SectionLabel label="Equity" />
            <tbody>
              <SectionGroup
                label="Equity Accounts"
                section={report.retainedEquityAccounts}
                expanded={open.eq}
                onToggle={() => toggle('eq')}
                subtotalLabel="Total Equity Accounts"
              />
              {/* Net income — not expandable; comes from revenue/expense accounts */}
              <tr className="border-b border-rim">
                <td className={`${colChevron} py-2.5`}></td>
                <td className={`${colNumber} py-2.5 text-ash`}></td>
                <td className={`${colName} py-2.5 text-sm text-ash`}>
                  Net Income
                  <span className="ml-2 text-[10px] text-ash/50 font-medium">current period · unreconciled</span>
                </td>
                <td className={`${colAmount} py-2.5 ${report.netIncome < 0 ? 'text-red-400' : 'text-chalk'}`}>
                  {fmt(report.netIncome)}
                </td>
              </tr>
              <GrandTotalRow label="Total Equity" amount={report.equity} />
            </tbody>
          </StatementTable>

          {/* ── Accounting equation check ── */}
          <div className="border border-rim rounded-sm bg-raised/50 px-4 py-3 flex items-center justify-between">
            <span className="text-xs text-ash tracking-wide">Assets = Liabilities + Equity</span>
            {report.balanced ? (
              <span className="text-xs font-bold text-emerald-400 tracking-wide">✓ Balanced</span>
            ) : (
              <span className="text-xs font-bold text-red-400 tracking-wide">✗ Out of balance</span>
            )}
          </div>

          {!report.balanced && (
            <div className="text-sm text-amber-300 bg-amber-950/50 border border-amber-800 px-4 py-3 rounded-sm">
              The accounting equation does not hold for this date. This may indicate unposted
              or reversed entries that need review.
            </div>
          )}
        </div>
      )}
    </div>
  )
}
