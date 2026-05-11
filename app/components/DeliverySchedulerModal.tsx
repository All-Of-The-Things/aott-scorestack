'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'

interface IntegrationStatus {
  connectSafelyConnected: boolean
  connectSafelyLastError: string | null
}

interface Props {
  runId: string
  templateId: string
  messageCount: number
  contactIds?: string[]
  isOpen: boolean
  onClose: () => void
  onScheduled: (jobId: string) => void
}

export default function DeliverySchedulerModal({ runId, templateId, messageCount, contactIds, isOpen, onClose, onScheduled }: Props) {
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [integration, setIntegration] = useState<IntegrationStatus | null>(null)

  useEffect(() => {
    if (!isOpen) return
    fetch('/api/org/integrations')
      .then((r) => r.ok ? r.json() as Promise<IntegrationStatus> : null)
      .then((data) => setIntegration(data))
      .catch(() => null)
  }, [isOpen])

  if (!isOpen) return null

  const byokConnected = integration?.connectSafelyConnected && !integration?.connectSafelyLastError
  const byokError = integration?.connectSafelyConnected && !!integration?.connectSafelyLastError
  const sendBlocked = byokError

  async function handleSendNow() {
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch('/api/delivery/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          run_id: runId,
          template_id: templateId,
          ...(contactIds?.length ? { contact_ids: contactIds } : {}),
        }),
      })
      if (!res.ok) {
        const data = await res.json() as { error?: string }
        throw new Error(data.error ?? 'Failed to start delivery')
      }
      const data = await res.json() as { job: { id: string } }
      onScheduled(data.job.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-sm bg-white rounded-2xl shadow-xl overflow-hidden">
        {/* Header */}
        <div className="px-5 pt-5 pb-4 border-b border-gray-100">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-gray-900">Send LinkedIn messages</h2>
              <p className="text-xs text-gray-500 mt-0.5">
                {messageCount} message{messageCount !== 1 ? 's' : ''} will be sent via LinkedIn
              </p>
            </div>
            <button
              onClick={onClose}
              disabled={submitting}
              className="shrink-0 text-gray-400 hover:text-gray-600 transition-colors disabled:opacity-50"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-3">
          {/* Sender identity */}
          {byokError ? (
            <div className="flex items-start gap-2.5 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5">
              <svg className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
              </svg>
              <div>
                <p className="text-xs font-medium text-amber-800">LinkedIn connection issue</p>
                <p className="text-xs text-amber-700 mt-0.5">
                  {integration?.connectSafelyLastError}{' '}
                  <Link href="/settings/integrations" className="underline">Fix in Integrations →</Link>
                </p>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2.5 rounded-lg border border-gray-100 bg-gray-50 px-3 py-2.5">
              <div className="w-6 h-6 rounded-full bg-indigo-100 flex items-center justify-center shrink-0">
                <svg className="w-3.5 h-3.5 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
                </svg>
              </div>
              <p className="text-xs text-gray-600">
                {byokConnected
                  ? <>Sent from your <span className="font-medium text-gray-800">connected LinkedIn account</span></>
                  : <>Sent from the <span className="font-medium text-gray-800">ScoreStack outreach agent</span></>
                }
              </p>
            </div>
          )}

          {/* Info */}
          <div className="flex items-start gap-2.5 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2.5">
            <svg className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
            </svg>
            <p className="text-xs text-blue-700">
              Messages are sent sequentially with a short delay between each to respect LinkedIn&apos;s rate limits. You&apos;ll receive an email when delivery completes.
            </p>
          </div>

          {/* Send now option */}
          <div className="rounded-lg border border-gray-200 overflow-hidden">
            <button
              onClick={handleSendNow}
              disabled={submitting || sendBlocked}
              className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors disabled:opacity-60 text-left"
            >
              <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
                <svg className="w-4 h-4 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
                </svg>
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-900">Send now</p>
                <p className="text-xs text-gray-500">Start sending immediately in the background</p>
              </div>
              {submitting && (
                <div className="w-4 h-4 border-2 border-blue-200 border-t-blue-600 rounded-full animate-spin shrink-0" />
              )}
            </button>

            {/* Coming soon: schedule */}
            <div className="border-t border-gray-100 flex items-center gap-3 px-4 py-3 opacity-50 cursor-not-allowed select-none">
              <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center shrink-0">
                <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
                </svg>
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-gray-700">Schedule for later</p>
                  <span className="text-[10px] font-semibold text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded-full">Coming soon</span>
                </div>
                <p className="text-xs text-gray-400">Pick a date and time to send</p>
              </div>
            </div>
          </div>

          {error && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 pb-5">
          <button
            onClick={onClose}
            disabled={submitting}
            className="w-full px-4 py-2 text-sm text-gray-500 hover:text-gray-700 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
