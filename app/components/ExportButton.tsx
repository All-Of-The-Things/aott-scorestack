'use client'

import { useState } from 'react'
import UpgradeModal from './UpgradeModal'
import { isFreePlan } from '@/app/lib/planUtils'

interface ExportButtonProps {
  runId: string
  plan: string
}

export default function ExportButton({ runId, plan }: ExportButtonProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [upgradeRequired, setUpgradeRequired] = useState<'starter' | 'pro' | null>(null)

  async function handleExport() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/runs/${runId}/export`, { cache: 'no-store' })
      if (res.status === 403) {
        const body = await res.json().catch(() => ({}))
        const required: 'starter' | 'pro' = body.requiredPlan ?? 'starter'
        if (!isFreePlan(plan)) {
          // User's plan covers this feature — something unexpected went wrong server-side.
          setError('Export failed — please refresh and try again.')
        } else {
          setUpgradeRequired(required)
        }
        return
      }
      if (!res.ok) {
        setError(`Export failed (${res.status}) — please try again.`)
        return
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const disposition = res.headers.get('Content-Disposition') ?? ''
      const match = disposition.match(/filename="([^"]+)"/)
      const filename = match?.[1] ?? `${runId}_scores.csv`
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      setTimeout(() => URL.revokeObjectURL(url), 100)
    } finally {
      setLoading(false)
    }
  }

  const isRestricted = isFreePlan(plan)

  return (
    <>
      <div className="flex flex-col items-start gap-1">
        <button
          onClick={handleExport}
          disabled={loading}
          className={`inline-flex items-center gap-1.5 text-xs font-medium border px-2.5 py-1 rounded-full disabled:opacity-50 transition-colors cursor-pointer ${
            isRestricted
              ? 'text-gray-500 bg-gray-50 border-gray-200 hover:bg-gray-100'
              : 'text-blue-700 bg-blue-50 border-blue-100 hover:bg-blue-100'
          }`}
        >
          {isRestricted ? (
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
            </svg>
          ) : (
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
            </svg>
          )}
          {loading ? 'Preparing…' : 'Export CSV'}
        </button>
        {error && <p className="text-xs text-red-500">{error}</p>}
      </div>

      {upgradeRequired && (
        <UpgradeModal
          trigger="Export your full results as CSV"
          requiredPlan={upgradeRequired}
          isOpen
          onClose={() => setUpgradeRequired(null)}
          currentPlan={plan as 'free' | 'starter' | 'pro' | 'enterprise'}
        />
      )}
    </>
  )
}
