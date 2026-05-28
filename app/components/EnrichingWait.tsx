'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

interface StatusResponse {
  status: string
  totalContacts: number
  processedCount: number
  lastContactUrl: string | null
}

interface PollSnapshot {
  processedCount: number
  timestamp: number
}

interface EnrichingWaitProps {
  runId: string
  totalContacts: number
}

const POLL_INTERVAL_MS = 5000
const MAX_SNAPSHOTS = 3

function formatEta(ms: number): string {
  if (ms < 60_000) return 'Less than a minute'
  if (ms < 3_600_000) return `~${Math.ceil(ms / 60_000)} min`
  return `~${Math.ceil(ms / 3_600_000)} hr`
}

function stripLinkedInHost(url: string): string {
  try {
    const u = new URL(url.startsWith('http') ? url : `https://${url}`)
    return u.pathname.replace(/\/$/, '')
  } catch {
    return url
  }
}

export default function EnrichingWait({ runId, totalContacts }: EnrichingWaitProps) {
  const router = useRouter()
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const snapshotsRef = useRef<PollSnapshot[]>([])

  const [processedCount, setProcessedCount] = useState(0)
  const [lastContactUrl, setLastContactUrl] = useState<string | null>(null)
  const [eta, setEta] = useState<string | null>(null)

  useEffect(() => {
    async function poll() {
      try {
        const res = await fetch(`/api/runs/${runId}/status`)
        if (!res.ok) return
        const data: StatusResponse = await res.json()

        if (data.status !== 'enriching') {
          if (intervalRef.current) clearInterval(intervalRef.current)
          router.refresh()
          return
        }

        setProcessedCount(data.processedCount)
        setLastContactUrl(data.lastContactUrl)

        const snapshot: PollSnapshot = { processedCount: data.processedCount, timestamp: Date.now() }
        snapshotsRef.current = [...snapshotsRef.current, snapshot].slice(-MAX_SNAPSHOTS)

        const snapshots = snapshotsRef.current
        if (snapshots.length >= 2) {
          const oldest = snapshots[0]!
          const newest = snapshots[snapshots.length - 1]!
          const deltaProcessed = newest.processedCount - oldest.processedCount
          const deltaMs = newest.timestamp - oldest.timestamp
          if (deltaProcessed > 0 && deltaMs > 0) {
            const msPerContact = deltaMs / deltaProcessed
            const remaining = (data.totalContacts || totalContacts) - data.processedCount
            setEta(remaining > 0 ? formatEta(remaining * msPerContact) : null)
          }
        }
      } catch {
        // Non-fatal — keep polling
      }
    }

    poll()
    intervalRef.current = setInterval(poll, POLL_INTERVAL_MS)
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [runId, router, totalContacts])

  const total = totalContacts || 1
  const pct = Math.min(100, Math.round((processedCount / total) * 100))

  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-10 max-w-sm w-full">

        {/* Progress bar */}
        <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-blue-500 rounded-full transition-all duration-700 ease-out"
            style={{ width: `${pct}%` }}
          />
        </div>

        {/* Counts */}
        <div className="mt-4 flex items-baseline justify-between">
          <p className="text-sm font-semibold text-gray-800">Enriching contacts…</p>
          <p className="text-xs tabular-nums text-gray-400">
            {processedCount}<span className="text-gray-300">/{totalContacts}</span>
          </p>
        </div>

        {/* Current contact */}
        <p className="mt-3 text-[11px] font-mono text-gray-400 truncate">
          {lastContactUrl
            ? stripLinkedInHost(lastContactUrl)
            : <span className="italic">Starting…</span>
          }
        </p>

        {/* ETA */}
        <p className="mt-3 text-[11px] text-gray-400">
          {eta ? `${eta} remaining` : 'Estimating time…'}
        </p>

      </div>
    </div>
  )
}
