'use client'

import { useEffect, useRef, useState } from 'react'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type EnrichStep = 'starting' | 'enriching' | 'complete' | 'cap-notice' | 'error'

interface ContactLog {
  name: string
  status: 'success' | 'failed' | 'skipped'
}

interface EnrichmentProgressProps {
  blobUrl: string
  linkedinColumn: string
  originalFilename: string
  name?: string
  /** Email to notify when enrichment completes (from pre-enrichment choice). */
  notifyEmail?: string
  /** Called with the new run_id when enrichment finishes successfully. */
  onComplete: (runId: string) => void
  /** Called with an error message if the stream fails or the server returns an error event. */
  onError: (message: string) => void
}

// Max contacts shown in the rolling log
const LOG_MAX = 5

// Format milliseconds into a human-readable estimate string.
// Returns null if fewer than 3 contacts have been processed (too early to be reliable).
function formatEta(remainingMs: number, completed: number): string | null {
  if (completed < 3) return null
  if (remainingMs <= 0) return null
  const totalSec = Math.ceil(remainingMs / 1000)
  if (totalSec < 5) return null
  const mins = Math.floor(totalSec / 60)
  const secs = totalSec % 60
  if (mins === 0) return `~${secs}s remaining`
  return secs === 0 ? `~${mins}m remaining` : `~${mins}m ${secs}s remaining`
}

// ---------------------------------------------------------------------------
// EnrichmentProgress
//
// Starts a fetch to POST /api/enrich on mount using ReadableStream reading
// (EventSource only supports GET; the enrich route requires POST).
//
// Reads the SSE stream line-by-line:
//   { type: 'progress', current, total, contact_name, enrichment_status }
//   { type: 'complete', run_id }
//   { type: 'error',   message }
//
// Cleans up the reader on unmount to avoid dangling fetches.
// ---------------------------------------------------------------------------

export default function EnrichmentProgress({
  blobUrl,
  linkedinColumn,
  originalFilename,
  name,
  notifyEmail,
  onComplete,
  onError,
}: EnrichmentProgressProps) {
  const [step, setStep] = useState<EnrichStep>('starting')
  const [current, setCurrent] = useState(0)
  const [total, setTotal] = useState(0)
  const [currentContact, setCurrentContact] = useState<string>('')
  const [successCount, setSuccessCount] = useState(0)
  const [failedCount, setFailedCount] = useState(0)
  const [log, setLog] = useState<ContactLog[]>([])
  const [errorMessage, setErrorMessage] = useState<string>('')
  const [estimatedRemainingMs, setEstimatedRemainingMs] = useState<number>(0)
  const [avgMsPerContact, setAvgMsPerContact] = useState<number>(0)

  const [, setRunId] = useState<string | null>(null)
  const [cappedInfo, setCappedInfo] = useState<{ original: number; capped_to: number } | null>(null)
  const [completedRunId, setCompletedRunId] = useState<string | null>(null)
  const [isQuotaError, setIsQuotaError] = useState(false)
  const [quotaErrorDetails, setQuotaErrorDetails] = useState<{ message: string; balance?: number; needed?: number } | null>(null)

  const readerRef = useRef<ReadableStreamDefaultReader<Uint8Array> | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    const abort = new AbortController()
    abortRef.current = abort

    async function runEnrichment() {
      let localCappedInfo: { original: number; capped_to: number } | null = null
      setStep('starting')

      let res: Response
      try {
        res = await fetch('/api/enrich', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            blob_url: blobUrl,
            linkedin_column: linkedinColumn,
            original_filename: originalFilename,
            ...(notifyEmail ? { notify_email: notifyEmail } : {}),
            ...(name ? { name } : {}),
          }),
          signal: abort.signal,
        })
      } catch (err) {
        if ((err as Error).name === 'AbortError') return
        const msg = err instanceof Error ? err.message : 'Failed to start enrichment'
        setErrorMessage(msg)
        setStep('error')
        onError(msg)
        return
      }

      if (!res.ok || !res.body) {
        const msg = `Enrichment request failed (${res.status})`
        setErrorMessage(msg)
        setStep('error')
        onError(msg)
        return
      }

      setStep('enriching')
      const reader = res.body.getReader()
      readerRef.current = reader
      const decoder = new TextDecoder()
      let buffer = ''

      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n')
          // Keep incomplete last line in buffer
          buffer = lines.pop() ?? ''

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue
            const raw = line.slice(6).trim()
            if (!raw) continue

            let event: Record<string, unknown>
            try {
              event = JSON.parse(raw)
            } catch {
              continue
            }

            if (event.type === 'started') {
              setRunId(event.run_id as string)
            } else if (event.type === 'capped') {
              localCappedInfo = { original: event.original as number, capped_to: event.capped_to as number }
              setCappedInfo(localCappedInfo)
            } else if (event.type === 'progress') {
              const cur = event.current as number
              const tot = event.total as number
              const name = (event.contact_name as string) || `Row ${cur}`
              const status = event.enrichment_status as 'success' | 'failed' | 'skipped'

              setCurrent(cur)
              setTotal(tot)
              setCurrentContact(name)
              setEstimatedRemainingMs((event.estimated_remaining_ms as number) ?? 0)
              setAvgMsPerContact((event.avg_ms_per_contact as number) ?? 0)

              if (status === 'success') setSuccessCount((n) => n + 1)
              else setFailedCount((n) => n + 1)

              setLog((prev) => {
                const next = [{ name, status }, ...prev]
                return next.slice(0, LOG_MAX)
              })
            } else if (event.type === 'complete') {
              const rid = event.run_id as string
              setRunId(rid)
              if (localCappedInfo) {
                setCompletedRunId(rid)
                setStep('cap-notice')
              } else {
                setStep('complete')
                onComplete(rid)
              }
              return
            } else if (event.type === 'error') {
              if (event.code === 'quota_exceeded') {
                setIsQuotaError(true)
                setQuotaErrorDetails({
                  message: (event.message as string) || 'Insufficient credits',
                  balance: event.balance as number | undefined,
                  needed:  event.needed  as number | undefined,
                })
                setStep('error')
              } else {
                const msg = (event.message as string) || 'Enrichment failed'
                setErrorMessage(msg)
                setStep('error')
                onError(msg)
              }
              return
            }
          }
        }
      } catch (err) {
        if ((err as Error).name === 'AbortError') return
        const msg = err instanceof Error ? err.message : 'Stream read error'
        setErrorMessage(msg)
        setStep('error')
        onError(msg)
      } finally {
        reader.releaseLock()
      }
    }

    runEnrichment()

    return () => {
      abort.abort()
      readerRef.current?.cancel().catch(() => {})
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // intentionally empty — runs once on mount

  const percent = total > 0 ? Math.round((current / total) * 100) : 0

  // ---------------------------------------------------------------------------
  // Cap notice interstitial — shown after enrichment when free plan was applied
  // ---------------------------------------------------------------------------
  if (step === 'cap-notice' && cappedInfo && completedRunId) {
    return (
      <div className="bg-white rounded-2xl shadow-sm border border-amber-200 p-8 max-w-sm w-full mx-auto text-center">
        <div className="w-10 h-10 bg-amber-100 rounded-full flex items-center justify-center mx-auto">
          <svg className="w-5 h-5 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
          </svg>
        </div>
        <h2 className="mt-4 text-sm font-semibold text-gray-800">Free plan limit reached</h2>
        <p className="mt-1.5 text-xs text-gray-600 bg-amber-50 rounded-lg px-3 py-2">
          Your CSV had <span className="font-medium">{cappedInfo.original}</span> contacts.
          Only the first <span className="font-medium">{cappedInfo.capped_to}</span> were enriched on the free plan.
        </p>
        <button
          onClick={() => onComplete(completedRunId)}
          className="mt-5 w-full py-2.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
        >
          Continue to scoring →
        </button>
        <a
          href="/settings/billing"
          className="mt-3 block text-xs text-gray-500 hover:text-gray-700 transition-colors"
        >
          Upgrade for unlimited enrichment
        </a>
      </div>
    )
  }

  // ---------------------------------------------------------------------------
  // Error state
  // ---------------------------------------------------------------------------
  if (step === 'error') {
    if (isQuotaError && quotaErrorDetails) {
      return (
        <div className="bg-white rounded-2xl shadow-sm border border-orange-200 p-8 max-w-sm w-full mx-auto text-center">
          <div className="w-10 h-10 bg-orange-100 rounded-full flex items-center justify-center mx-auto">
            <svg className="w-5 h-5 text-orange-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round"
                d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z" />
            </svg>
          </div>
          <h2 className="mt-4 text-sm font-semibold text-gray-800">Credits needed</h2>
          <p className="mt-1.5 text-xs text-gray-600 bg-orange-50 rounded-lg px-3 py-2">
            {quotaErrorDetails.message}
          </p>
          {quotaErrorDetails.balance !== undefined && (
            <p className="mt-2 text-xs text-gray-500">
              Balance: <span className="font-medium">{quotaErrorDetails.balance}</span> credits
              {quotaErrorDetails.needed !== undefined && (
                <> &bull; Needed: <span className="font-medium">{quotaErrorDetails.needed}</span></>
              )}
            </p>
          )}
          <a
            href="/settings/billing"
            className="mt-5 inline-block w-full py-2.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
          >
            Go to billing →
          </a>
          <button
            onClick={() => onError(quotaErrorDetails.message)}
            className="mt-3 text-xs text-gray-500 hover:text-gray-700 transition-colors"
          >
            ← Start over
          </button>
        </div>
      )
    }

    return (
      <div className="bg-white rounded-2xl shadow-sm border border-red-200 p-8 max-w-sm w-full mx-auto text-center">
        <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center mx-auto">
          <svg className="w-5 h-5 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round"
              d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
          </svg>
        </div>
        <h2 className="mt-4 text-sm font-semibold text-gray-800">Enrichment failed</h2>
        <p className="mt-1.5 text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{errorMessage}</p>
        <button
          onClick={() => onError(errorMessage)}
          className="mt-5 text-xs text-gray-500 hover:text-gray-700 transition-colors"
        >
          ← Start over
        </button>
      </div>
    )
  }

  // ---------------------------------------------------------------------------
  // Starting / enriching / complete states
  // ---------------------------------------------------------------------------
  return (
    <div className="flex flex-col gap-3 w-full max-w-lg mx-auto">
    <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden w-full">

      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-100">
        <div className="flex items-center justify-between">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-gray-800 truncate">{originalFilename}</p>
            <p className="text-xs text-gray-400 mt-0.5">
              LinkedIn column:{' '}
              <span className="font-mono bg-gray-100 px-1 rounded">{linkedinColumn}</span>
            </p>
          </div>

          {step === 'complete' ? (
            <span className="shrink-0 ml-3 inline-flex items-center gap-1 text-xs text-green-700 font-medium bg-green-50 border border-green-100 px-2 py-1 rounded-full">
              <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" clipRule="evenodd"
                  d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" />
              </svg>
              Done
            </span>
          ) : (
            <div className="shrink-0 ml-3 w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          )}
        </div>
      </div>

      {/* Progress bar */}
      <div className="px-6 pt-5 pb-2">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-medium text-gray-500">
            {step === 'starting'
              ? 'Starting…'
              : step === 'complete'
              ? 'Enrichment complete'
              : currentContact
              ? `Enriching ${currentContact}…`
              : 'Enriching contacts…'}
          </span>
          <span className="text-xs font-semibold text-gray-700 tabular-nums">
            {total > 0 ? `${current} / ${total}` : '—'}
          </span>
        </div>

        {/* Track */}
        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-blue-500 rounded-full transition-all duration-300 ease-out"
            style={{ width: `${percent}%` }}
          />
        </div>

        <div className="mt-1.5 flex items-center justify-between">
          <span className="text-xs text-gray-400">
            {formatEta(estimatedRemainingMs, current) ?? ''}
          </span>
          <span className="text-xs text-gray-400 tabular-nums">{percent}%</span>
        </div>
      </div>

      {/* Counters */}
      {(successCount > 0 || failedCount > 0) && (
        <div className="px-6 pb-4 flex gap-4">
          <div className="flex items-center gap-1.5 text-xs text-green-700">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500 shrink-0" />
            <span className="tabular-nums font-medium">{successCount}</span>
            <span className="text-green-600">enriched</span>
          </div>
          {failedCount > 0 && (
            <div className="flex items-center gap-1.5 text-xs text-red-600">
              <span className="w-1.5 h-1.5 rounded-full bg-red-400 shrink-0" />
              <span className="tabular-nums font-medium">{failedCount}</span>
              <span>failed</span>
            </div>
          )}
          {avgMsPerContact > 0 && (
            <div className="ml-auto flex items-center gap-1 text-xs text-gray-400">
              <span className="tabular-nums">{(avgMsPerContact / 1000).toFixed(1)}s</span>
              <span>avg/contact</span>
            </div>
          )}
        </div>
      )}

      {/* Rolling contact log */}
      {log.length > 0 && (
        <div className="border-t border-gray-50 divide-y divide-gray-50">
          {log.map((entry, i) => (
            <div
              key={`${entry.name}-${i}`}
              className="px-6 py-2.5 flex items-center justify-between gap-3"
              style={{ opacity: 1 - i * 0.18 }}
            >
              <span className="text-xs text-gray-600 truncate">{entry.name}</span>
              {entry.status === 'success' ? (
                <span className="shrink-0 inline-flex items-center gap-1 text-xs text-green-600 font-medium">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                  </svg>
                  enriched
                </span>
              ) : (
                <span className="shrink-0 inline-flex items-center gap-1 text-xs text-red-400 font-medium">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                  failed
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Confirm the user can safely close the tab when they chose "notify me" upfront */}
      {notifyEmail && step === 'enriching' && (
        <div className="border-t border-gray-100 px-6 py-3 bg-gray-50/60">
          <p className="text-xs text-gray-500 flex items-center gap-1.5">
            <svg className="w-3.5 h-3.5 text-green-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
            </svg>
            We&apos;ll email <span className="font-medium text-gray-700">{notifyEmail}</span> when results are ready. You can safely close this tab.
          </p>
        </div>
      )}
    </div>

    </div>
  )
}
