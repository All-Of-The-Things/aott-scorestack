'use client'

import { useState } from 'react'

interface EnrichmentConfirmProps {
  filename: string
  onSubmit: (email: string) => Promise<void>
  initialEmail?: string
}

export default function EnrichmentConfirm({ filename, onSubmit, initialEmail }: EnrichmentConfirmProps) {
  const [email, setEmail] = useState(initialEmail ?? '')
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.trim() || submitting) return
    setSubmitting(true)
    await onSubmit(email.trim())
    setSubmitting(false)
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden max-w-lg w-full mx-auto">
      <div className="px-6 py-4 border-b border-gray-100">
        <p className="text-sm font-semibold text-gray-800 truncate">{filename}</p>
        <p className="text-xs text-gray-400 mt-0.5">Ready to enrich</p>
      </div>

      <form onSubmit={handleSubmit} className="p-6 flex flex-col gap-4">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1.5" htmlFor="notify-email">
            Notify me when done
          </label>
          <input
            id="notify-email"
            type="email"
            required
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={submitting}
            className="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 disabled:opacity-50"
          />
          <p className="mt-1.5 text-xs text-gray-400">
            We&apos;ll email you a link when results are ready.
          </p>
        </div>

        <button
          type="submit"
          disabled={!email.trim() || submitting}
          className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
        >
          {submitting ? (
            <>
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Starting…
            </>
          ) : (
            'Start enrichment →'
          )}
        </button>
      </form>
    </div>
  )
}
