'use client'

import { useState } from 'react'

interface ExportButtonProps {
  runId: string
  isFree: boolean
}

export default function ExportButton({ runId, isFree }: ExportButtonProps) {
  const [loading, setLoading] = useState(false)

  function handleExport() {
    setLoading(true)
    const a = document.createElement('a')
    a.href = `/api/runs/${runId}/export`
    a.click()
    setTimeout(() => setLoading(false), 1500)
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <button
        onClick={handleExport}
        disabled={loading}
        className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-60 rounded-lg transition-colors"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
        </svg>
        {loading ? 'Preparing…' : 'Export CSV'}
      </button>
      {isFree && (
        <p className="text-[11px] text-gray-400">
          Free plan: top 10 contacts.{' '}
          <a href="/settings/billing" className="underline hover:text-gray-600">Upgrade</a> for all.
        </p>
      )}
    </div>
  )
}
