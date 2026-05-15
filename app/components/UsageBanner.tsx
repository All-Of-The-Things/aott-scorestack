'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useSession } from 'next-auth/react'

interface UsageData {
  plan: string
  runCount: number | null
}

export default function UsageBanner() {
  const { status } = useSession()
  const [usage, setUsage] = useState<UsageData | null>(null)

  useEffect(() => {
    if (status !== 'authenticated') return
    fetch('/api/usage')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => { if (data) setUsage(data) })
      .catch(() => {})
  }, [status])

  if (status !== 'authenticated' || !usage) return null
  if (usage.plan !== 'free') return null

  const runCount = usage.runCount ?? 0

  return (
    <div className="max-w-5xl mx-auto px-4 pt-3">
      <div className="flex items-center gap-2 text-xs text-gray-500 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
        <span>Free plan · {runCount}/5 enrichments · 50 contacts per run</span>
        <span className="text-gray-300">·</span>
        <Link href="/settings/billing" className="text-blue-600 hover:text-blue-700 font-medium">
          Upgrade →
        </Link>
      </div>
    </div>
  )
}
