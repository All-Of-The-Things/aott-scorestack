'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

interface StatusResponse {
  status: string
  totalContacts: number
  processedCount: number
  lastContactUrl: string | null
  lastContactName: string | null
}

interface PollSnapshot {
  processedCount: number
  timestamp: number
}

interface EnrichingWaitProps {
  runId: string
  totalContacts: number
  hasCompanyUrl?: boolean
}

const POLL_INTERVAL_MS = 5000
const MAX_SNAPSHOTS = 3
const MSG_INTERVAL_MS = 2500
const ETA_MIN_CONTACTS = Number(process.env.NEXT_PUBLIC_ETA_MIN_CONTACTS ?? '10')

const MESSAGES = {
  company:    ['Fetching company profile…', 'Reading LinkedIn data…', 'Analyzing your organization…', 'Enriching company context…'],
  starting:   ['Reading your contact list…', 'Connecting to data sources…', 'Preparing enrichment pipeline…', 'Warming up…'],
  processing: ['Fetching LinkedIn profile…', 'Extracting professional data…', 'Analyzing work history…', 'Processing connections…'],
}

type Phase = 'company' | 'starting' | 'processing'

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

function Spinner() {
  return (
    <svg className="animate-spin h-3.5 w-3.5 text-blue-500 shrink-0" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.4 0 0 5.4 0 12h4z" />
    </svg>
  )
}

export default function EnrichingWait({ runId, totalContacts, hasCompanyUrl }: EnrichingWaitProps) {
  const router = useRouter()
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const snapshotsRef = useRef<PollSnapshot[]>([])

  const [processedCount, setProcessedCount] = useState(0)
  const [lastContactUrl, setLastContactUrl] = useState<string | null>(null)
  const [lastContactName, setLastContactName] = useState<string | null>(null)
  const [eta, setEta] = useState<string | null>(null)

  const phase: Phase =
    processedCount === 0 && hasCompanyUrl ? 'company'
    : processedCount === 0               ? 'starting'
    :                                      'processing'

  const [msgIndex, setMsgIndex] = useState(0)
  const prevPhaseRef = useRef<Phase>(phase)

  // Reset message index when phase changes
  useEffect(() => {
    if (prevPhaseRef.current !== phase) {
      setMsgIndex(0)
      prevPhaseRef.current = phase
    }
  }, [phase])

  // Cycle phase messages
  useEffect(() => {
    const messages = MESSAGES[phase]
    const timer = setInterval(() => setMsgIndex(i => (i + 1) % messages.length), MSG_INTERVAL_MS)
    return () => clearInterval(timer)
  }, [phase])


  // Polling
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
        setLastContactName(data.lastContactName)

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
  const currentMessage = MESSAGES[phase][msgIndex % MESSAGES[phase].length]!

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

        {/* Status header */}
        <div className="mt-4 flex items-center gap-2">
          <Spinner />
          <p className="text-sm font-semibold text-gray-800">
            {phase === 'company'    ? 'Enriching company…'
             : phase === 'starting' ? 'Starting enrichment…'
             :                       'Enriching contacts…'}
          </p>
          {phase === 'processing' && (
            <p className="ml-auto text-xs tabular-nums text-gray-400 shrink-0">
              {processedCount}<span className="text-gray-300">/{totalContacts}</span>
            </p>
          )}
        </div>

        {/* Body */}
        <div className="mt-3 min-w-0">
          {phase === 'processing' ? (
            <div className="space-y-2.5">
              {/* Last enriched contact */}
              {lastContactName && (
                <div className="flex items-start gap-1.5">
                  <span className="text-green-500 text-[11px] mt-0.5 shrink-0">✓</span>
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-gray-700 truncate">{lastContactName}</p>
                    {lastContactUrl && (
                      <p className="text-[11px] font-mono text-gray-400 truncate">
                        {stripLinkedInHost(lastContactUrl)}
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* Currently enriching */}
              {processedCount < totalContacts && (
                <div className="flex items-start gap-1.5">
                  <span className="text-blue-400 text-[11px] mt-0.5 shrink-0">→</span>
                  <div className="min-w-0">
                    <p className="text-xs text-gray-500">
                      Enriching contact {processedCount + 1} of {totalContacts}
                    </p>
                    <p className="text-[11px] text-gray-400 italic truncate">{currentMessage}</p>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <p className="text-[11px] text-gray-400 italic">{currentMessage}</p>
          )}
        </div>

        {/* ETA — only shown for runs large enough to be meaningful */}
        {totalContacts >= ETA_MIN_CONTACTS && (
          <p className="mt-4 text-[11px] text-gray-400">
            {eta ? `${eta} remaining` : 'Estimating time…'}
          </p>
        )}

      </div>
    </div>
  )
}
