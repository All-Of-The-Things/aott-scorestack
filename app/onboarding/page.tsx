'use client'

import { Suspense, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useSession } from 'next-auth/react'

// Standalone onboarding page — fallback for direct navigation to /onboarding.
// The primary flow uses WorkspaceNamePrompt as an inline overlay on score/results pages.

// ---------------------------------------------------------------------------
// Derive a placeholder workspace name from the user's email domain.
// martin@acme.com → "Acme"
// ---------------------------------------------------------------------------
function deriveWorkspaceName(email: string | null | undefined): string {
  if (!email) return ''
  const domain = email.split('@')[1]
  if (!domain) return ''
  const base = domain.split('.')[0]
  return base.charAt(0).toUpperCase() + base.slice(1)
}

// useSearchParams() must be inside a Suspense boundary.
function OnboardingForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const callbackUrl = searchParams.get('callbackUrl') ?? '/'
  const { data: session } = useSession()

  const defaultName = deriveWorkspaceName(session?.user?.email)
  const [name, setName] = useState(defaultName)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Already named — skip onboarding and honour callbackUrl
  if (session && session.user.orgName !== 'My Workspace') {
    router.replace(callbackUrl)
    return null
  }

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

      // Navigate to the destination. The server component there will call auth()
      // which fetches orgName live from DB — no client-side session refresh needed.
      router.push(callbackUrl)
    } catch {
      setError('Network error — please try again')
      setSubmitting(false)
    }
  }

  return (
    <main className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">

        {/* Logo */}
        <div className="flex items-center justify-center gap-2 mb-8">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
            <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 7.5L7.5 3m0 0L12 7.5M7.5 3v13.5m13.5 0L16.5 21m0 0L12 16.5m4.5 4.5V7.5" />
            </svg>
          </div>
          <span className="text-lg font-bold tracking-tight text-gray-900">ScoreStack</span>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
          <h1 className="text-lg font-semibold text-gray-900 mb-1">Name your workspace</h1>
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
                placeholder={defaultName || 'Acme Inc.'}
                maxLength={80}
                required
                disabled={submitting}
                className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg bg-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50"
              />
            </div>

            {error && (
              <p className="text-xs text-red-600">{error}</p>
            )}

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
    </main>
  )
}

export default function OnboardingPage() {
  return (
    <Suspense fallback={null}>
      <OnboardingForm />
    </Suspense>
  )
}
