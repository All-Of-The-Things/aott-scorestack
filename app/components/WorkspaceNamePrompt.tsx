'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

function deriveWorkspaceName(email: string | null | undefined): string {
  if (!email) return ''
  const domain = email.split('@')[1]
  if (!domain) return ''
  const base = domain.split('.')[0]
  return base.charAt(0).toUpperCase() + base.slice(1)
}

interface Props {
  show: boolean
  email?: string | null
}

export default function WorkspaceNamePrompt({ show, email }: Props) {
  const router = useRouter()
  const [name, setName] = useState(() => deriveWorkspaceName(email))
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!show) return null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) return
    setSubmitting(true)
    setError(null)

    try {
      const res = await fetch('/api/org', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmed }),
      })

      if (!res.ok) {
        const data = await res.json()
        setError(data.error ?? `Something went wrong (${res.status})`)
        setSubmitting(false)
        return
      }

      // Re-run the server component. The session callback fetches orgName live
      // from the DB so the prompt won't be shown on the next pass — no
      // navigation needed, the user stays on the current page.
      router.refresh()
    } catch {
      setError('Network error — please try again')
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-gray-50/80 backdrop-blur-sm flex items-center justify-center px-4">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-lg border border-gray-200 p-8">

        <div className="flex items-center gap-2 mb-6">
          <div className="w-7 h-7 bg-blue-600 rounded-lg flex items-center justify-center">
            <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 7.5L7.5 3m0 0L12 7.5M7.5 3v13.5m13.5 0L16.5 21m0 0L12 16.5m4.5 4.5V7.5" />
            </svg>
          </div>
          <span className="text-sm font-bold tracking-tight text-gray-900">ScoreStack</span>
        </div>

        <h2 className="text-base font-semibold text-gray-900 mb-1">Name your workspace</h2>
        <p className="text-sm text-gray-500 mb-6">
          This is how your team and scoring models will be labelled.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1.5">
              Workspace name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={deriveWorkspaceName(email) || 'Acme Inc.'}
              maxLength={80}
              required
              autoFocus
              disabled={submitting}
              className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg bg-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50"
            />
          </div>

          {error && <p className="text-xs text-red-600">{error}</p>}

          <button
            type="submit"
            disabled={submitting || !name.trim()}
            className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
          >
            {submitting ? 'Saving...' : 'Get started'}
          </button>
        </form>
      </div>
    </div>
  )
}
