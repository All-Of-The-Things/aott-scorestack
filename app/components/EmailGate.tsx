'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { signIn } from 'next-auth/react'

interface EmailGateProps {
  runId: string
}

// EmailGate — shown before scored results when the user has no session and no
// captured email. Submitting the form:
//   1. Stores the email on the Run (PATCH /api/runs/:runId/email)
//   2. Sends a magic-link sign-in email via NextAuth / Resend
//   3. Refreshes the page — server now sees notifyEmail set, renders full scoring page
//
// The magic link lets the user activate their account to enable model saving.
// If the sign-in email fails for any reason the results are still shown.
export default function EmailGate({ runId }: EmailGateProps) {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    setError(null)

    const trimmedEmail = email.trim()

    // Step 1: store the email on the run (also enables deferred notification)
    try {
      const res = await fetch(`/api/runs/${runId}/email`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: trimmedEmail }),
      })
      if (!res.ok) {
        const json = await res.json()
        throw new Error(json.error ?? 'Could not save your email')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
      setSubmitting(false)
      return
    }

    // Step 2: send a magic-link so the user can activate and enable model saving.
    // Non-blocking — if this fails we still show results.
    try {
      const result = await signIn('resend', { email: trimmedEmail, redirect: false })
      if (result?.error) {
        console.error('[EmailGate] Magic link send failed:', result.error)
      }
    } catch (err) {
      console.error('[EmailGate] signIn threw unexpectedly:', err)
    }

    // Step 3: refresh so the server component skips the gate
    router.refresh()
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8 text-center">
      <div className="w-12 h-12 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-4">
        <svg className="w-6 h-6 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 7.5L7.5 3m0 0L12 7.5M7.5 3v13.5m13.5 0L16.5 21m0 0L12 16.5m4.5 4.5V7.5" />
        </svg>
      </div>

      <h2 className="text-base font-semibold text-gray-900 mb-1">Your results are ready</h2>
      <p className="text-sm text-gray-500 mb-6 max-w-xs mx-auto">
        Enter your email to see your scored contacts. We&apos;ll also send a sign-in link so you can save models and export later.
      </p>

      <form onSubmit={handleSubmit} className="flex flex-col gap-3 max-w-xs mx-auto">
        <input
          type="email"
          required
          autoFocus
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg bg-white text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-shadow"
        />

        {error && (
          <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={submitting || !email.trim()}
          className="w-full px-4 py-2.5 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white text-sm font-medium rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {submitting ? 'Opening results…' : 'See my results'}
        </button>
      </form>

      <p className="mt-4 text-xs text-gray-400">
        Already have an account?{' '}
        <a href="/auth/signin" className="text-blue-500 hover:underline">Sign in</a>
      </p>
    </div>
  )
}
