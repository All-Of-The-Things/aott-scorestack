'use client'

import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import Link from 'next/link'

interface UsageData {
  plan: string
  managedCreditsBalance: number
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
  if (usage.plan === 'enterprise') return null

  if (usage.plan === 'free') {
    return (
      <div className="max-w-5xl mx-auto px-4 pt-3">
        <div className="flex items-center gap-2 text-xs text-gray-500 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
          <span>Free plan · 50 contacts per run</span>
          <span className="text-gray-300">·</span>
          <Link href="/settings/billing" className="text-blue-600 hover:text-blue-700 font-medium">
            Upgrade →
          </Link>
        </div>
      </div>
    )
  }

  // starter / pro — show credit balance bar
  const balance = usage.managedCreditsBalance
  const barColor =
    balance > 200 ? 'bg-green-500' :
    balance > 50  ? 'bg-amber-400' :
                    'bg-red-500'
  const textColor =
    balance > 200 ? 'text-green-700' :
    balance > 50  ? 'text-amber-700' :
                    'text-red-700'
  const bgColor =
    balance > 200 ? 'bg-green-50 border-green-200' :
    balance > 50  ? 'bg-amber-50 border-amber-200' :
                    'bg-red-50 border-red-200'

  const barWidth = Math.min(100, Math.max(0, (balance / 500) * 100))

  return (
    <div className="max-w-5xl mx-auto px-4 pt-3">
      <div className={`flex items-center gap-3 text-xs border rounded-lg px-3 py-2 ${bgColor}`}>
        <span className={`font-medium ${textColor}`}>{balance} enrichment credits remaining</span>
        <div className="flex-1 h-1.5 bg-gray-200 rounded-full overflow-hidden max-w-24">
          <div className={`h-full rounded-full ${barColor}`} style={{ width: `${barWidth}%` }} />
        </div>
        <Link href="/settings/billing" className={`font-medium hover:opacity-80 ${textColor}`}>
          Buy more →
        </Link>
      </div>
    </div>
  )
}
