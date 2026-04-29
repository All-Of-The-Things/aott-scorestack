'use client'

import { useEffect, useRef, useState } from 'react'

interface DeliveryJob {
  id: string
  runId: string
  channel: string
  status: string
  scheduledAt: string | null
  startedAt: string | null
  completedAt: string | null
  createdAt: string
  sentCount: number
  failedCount: number
  run: { name: string | null; originalFilename: string }
}

interface DeliveryMessage {
  id: string
  body: string
  editedBody: string | null
  deliveryStatus: string
  sentAt: string | null
  runResult: { linkedinUrl: string; rowIndex: number }
}

interface Props {
  initialJobs: DeliveryJob[]
}

const JOB_STATUS_BADGE: Record<string, string> = {
  scheduled: 'text-gray-600 bg-gray-100',
  running:   'text-blue-700 bg-blue-50 border border-blue-100',
  complete:  'text-green-700 bg-green-50 border border-green-100',
  failed:    'text-red-700 bg-red-50 border border-red-100',
  cancelled: 'text-gray-400 bg-gray-50 border border-gray-100',
}

const JOB_STATUS_LABEL: Record<string, string> = {
  scheduled: 'Scheduled',
  running:   'Sending…',
  complete:  'Complete',
  failed:    'Failed',
  cancelled: 'Cancelled',
}

function formatDate(iso: string | null) {
  if (!iso) return null
  return new Date(iso).toLocaleString('en-US', {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  })
}

function contactHandle(url: string) {
  return url.replace(/https?:\/\/(www\.)?linkedin\.com\/in\/?/, '').replace(/\/$/, '')
}

// ── Per-message status dot ───────────────────────────────────────────────────

function StatusDot({ status, isCurrent }: { status: string; isCurrent: boolean }) {
  if (isCurrent) {
    return (
      <span className="relative flex h-2.5 w-2.5 shrink-0">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
        <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-blue-500" />
      </span>
    )
  }
  if (status === 'sent') {
    return (
      <svg className="w-3.5 h-3.5 text-green-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
      </svg>
    )
  }
  if (status === 'failed') {
    return (
      <svg className="w-3.5 h-3.5 text-red-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
      </svg>
    )
  }
  return <span className="w-2 h-2 rounded-full bg-gray-200 shrink-0 mt-0.5" />
}

// ── Live message list for a single job ──────────────────────────────────────

function JobMessageList({ jobId, jobStatus }: { jobId: string; jobStatus: string }) {
  const [messages, setMessages] = useState<DeliveryMessage[]>([])
  const [loading, setLoading] = useState(true)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  async function fetchMessages() {
    try {
      const res = await fetch(`/api/delivery/jobs/${jobId}/messages`)
      if (!res.ok) return
      const data = await res.json() as { messages: DeliveryMessage[] }
      setMessages(data.messages)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchMessages()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId])

  useEffect(() => {
    if (jobStatus !== 'running') {
      if (pollRef.current) clearInterval(pollRef.current)
      return
    }
    pollRef.current = setInterval(fetchMessages, 3_000)
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId, jobStatus])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-6">
        <div className="w-4 h-4 border-2 border-gray-200 border-t-gray-500 rounded-full animate-spin" />
      </div>
    )
  }

  if (messages.length === 0) {
    return <p className="text-xs text-gray-400 px-4 py-4">No messages found.</p>
  }

  const firstPendingIdx = jobStatus === 'running'
    ? messages.findIndex((m) => m.deliveryStatus === 'pending')
    : -1

  return (
    <div className="divide-y divide-gray-50">
      {messages.map((msg, i) => {
        const isCurrent = i === firstPendingIdx
        const text = msg.editedBody ?? msg.body
        const handle = contactHandle(msg.runResult.linkedinUrl)

        return (
          <div
            key={msg.id}
            className={`px-4 py-3 flex items-start gap-3 transition-colors ${isCurrent ? 'bg-blue-50/60' : ''}`}
          >
            <div className="mt-1 flex items-center justify-center w-4">
              <StatusDot status={msg.deliveryStatus} isCurrent={isCurrent} />
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <a
                  href={msg.runResult.linkedinUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs font-medium text-blue-600 hover:underline truncate"
                >
                  {handle}
                </a>
                {isCurrent && (
                  <span className="text-[10px] font-medium text-blue-600">Sending…</span>
                )}
                {msg.deliveryStatus === 'failed' && (
                  <span className="text-[10px] font-medium text-red-500">Failed</span>
                )}
                {msg.deliveryStatus === 'sent' && msg.sentAt && (
                  <span className="text-[10px] text-gray-400">
                    {new Date(msg.sentAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit' })}
                  </span>
                )}
              </div>
              <p className="text-[11px] text-gray-500 line-clamp-2 leading-relaxed">{text}</p>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Single job card ──────────────────────────────────────────────────────────

function JobCard({
  job,
  onCancel,
  cancelling,
}: {
  job: DeliveryJob
  onCancel: (id: string) => void
  cancelling: boolean
}) {
  const isRunning = job.status === 'running'
  const isTerminal = job.status === 'complete' || job.status === 'failed' || job.status === 'cancelled'
  const [expanded, setExpanded] = useState(isRunning)
  const runLabel = job.run.name ?? job.run.originalFilename
  const total = job.sentCount + job.failedCount
  const completedAt = formatDate(job.completedAt)
  const startedAt = formatDate(job.startedAt)

  useEffect(() => {
    if (isRunning) setExpanded(true)
  }, [isRunning])

  return (
    <div className={`bg-white rounded-2xl shadow-sm border overflow-hidden ${isRunning ? 'border-blue-200' : 'border-gray-200'}`}>
      {/* Card header */}
      <div className="px-5 py-4 flex items-start gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-sm font-semibold text-gray-900 truncate">{runLabel}</span>
            <span className={`shrink-0 inline-flex items-center gap-1.5 text-[11px] font-medium px-2 py-0.5 rounded-full ${JOB_STATUS_BADGE[job.status] ?? JOB_STATUS_BADGE.scheduled}`}>
              {isRunning && <span className="w-1.5 h-1.5 border border-blue-400 border-t-blue-700 rounded-full animate-spin" />}
              {JOB_STATUS_LABEL[job.status] ?? job.status}
            </span>
          </div>

          <div className="flex items-center gap-3 text-[11px] text-gray-400">
            <span className="capitalize">{job.channel}</span>
            <span>·</span>
            {isRunning ? (
              <span className="text-blue-600 font-medium">
                {job.sentCount} sent{job.failedCount > 0 ? `, ${job.failedCount} failed` : ''}
              </span>
            ) : (
              <span>
                <span className="text-green-600 font-medium">{job.sentCount} sent</span>
                {job.failedCount > 0 && (
                  <span className="text-red-500 font-medium"> · {job.failedCount} failed</span>
                )}
              </span>
            )}
            {startedAt && <><span>·</span><span>Started {startedAt}</span></>}
            {completedAt && <><span>·</span><span>Done {completedAt}</span></>}
          </div>

          {/* Progress bar — shown while running */}
          {isRunning && total > 0 && (
            <div className="mt-2.5 flex items-center gap-2">
              <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-500 rounded-full transition-all duration-500"
                  style={{ width: `${Math.round((total / (total + (job.sentCount === 0 && job.failedCount === 0 ? 1 : 0))) * 100)}%` }}
                />
              </div>
              <span className="text-[11px] text-gray-400 shrink-0">{total} done</span>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 shrink-0">
          {job.status === 'scheduled' && (
            <button
              onClick={() => onCancel(job.id)}
              disabled={cancelling}
              className="text-xs text-red-500 hover:text-red-700 disabled:opacity-50 transition-colors"
            >
              {cancelling ? 'Cancelling…' : 'Cancel'}
            </button>
          )}
          {isTerminal && (
            <button
              onClick={() => setExpanded((v) => !v)}
              className="text-xs text-gray-400 hover:text-gray-600 transition-colors flex items-center gap-1"
            >
              {expanded ? 'Hide' : 'Show'} messages
              <svg className={`w-3 h-3 transition-transform ${expanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Message list */}
      {(isRunning || expanded) && (
        <div className={`border-t ${isRunning ? 'border-blue-100' : 'border-gray-100'}`}>
          <JobMessageList jobId={job.id} jobStatus={job.status} />
        </div>
      )}
    </div>
  )
}

// ── Main table ───────────────────────────────────────────────────────────────

export default function DeliveryJobsTable({ initialJobs }: Props) {
  const [jobs, setJobs] = useState<DeliveryJob[]>(initialJobs)
  const [cancelling, setCancelling] = useState<string | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const hasRunning = jobs.some((j) => j.status === 'running')

  useEffect(() => {
    if (!hasRunning) {
      if (pollRef.current) clearInterval(pollRef.current)
      return
    }

    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch('/api/delivery/jobs')
        if (!res.ok) return
        const data = await res.json() as { jobs: DeliveryJob[] }
        setJobs(data.jobs)
      } catch {
        // silent — keep polling
      }
    }, 10_000)

    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [hasRunning])

  async function handleCancel(jobId: string) {
    if (!confirm('Cancel this delivery job? Messages will return to pending.')) return
    setCancelling(jobId)
    try {
      const res = await fetch(`/api/delivery/jobs/${jobId}`, { method: 'DELETE' })
      if (!res.ok) return
      setJobs((prev) => prev.map((j) => j.id === jobId ? { ...j, status: 'cancelled' } : j))
    } finally {
      setCancelling(null)
    }
  }

  if (jobs.length === 0) {
    return (
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-10 text-center">
        <div className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3">
          <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
          </svg>
        </div>
        <h3 className="text-sm font-semibold text-gray-900 mb-1">No deliveries yet</h3>
        <p className="text-xs text-gray-500 max-w-xs mx-auto">
          Generate messages for a scored run and click Send to start your first LinkedIn delivery.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {jobs.map((job) => (
        <JobCard
          key={job.id}
          job={job}
          onCancel={handleCancel}
          cancelling={cancelling === job.id}
        />
      ))}
    </div>
  )
}
