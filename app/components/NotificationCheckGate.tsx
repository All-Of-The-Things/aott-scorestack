'use client'

import { useState } from 'react'
import { signIn } from 'next-auth/react'

interface NotificationCheckGateProps {
  runId: string
  email: string
}

/**
 * Shown on the score page when the user previously chose "notify me" and the
 * enrichment completion email has been sent. Instead of asking for their email
 * again (EmailGate), we tell them to check their inbox and let them resend.
 *
 * Clicking the magic link in the email creates a session and the score page
 * re-renders without the gate.
 */
export default function NotificationCheckGate({ runId, email }: NotificationCheckGateProps) {
  const [resent, setResent] = useState(false)
  const [resending, setResending] = useState(false)
  const [resendError, setResendError] = useState(false)

  const handleResend = async () => {
    if (resending) return
    setResending(true)
    setResendError(false)
    try {
      const result = await signIn('resend', {
        email,
        redirect: false,
        callbackUrl: `/run/${runId}/score`,
      })
      if (result?.error) {
        console.error('[NotificationCheckGate] resend failed:', result.error)
        setResendError(true)
      } else {
        setResent(true)
      }
    } catch (err) {
      console.error('[NotificationCheckGate] resend threw:', err)
      setResendError(true)
    } finally {
      setResending(false)
    }
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-200 px-6 py-8 text-center">
      {/* Envelope icon */}
      <div className="flex justify-center mb-4">
        <div className="w-12 h-12 rounded-full bg-blue-50 flex items-center justify-center">
          <svg className="w-6 h-6 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
        </div>
      </div>

      <h2 className="text-base font-semibold text-gray-900 mb-1">Check your inbox</h2>
      <p className="text-sm text-gray-500 mb-6">
        We sent a sign-in link to <span className="font-medium text-gray-700">{email}</span>.
        Click it to view your results and save scoring models.
      </p>

      {resent ? (
        <p className="text-xs text-green-600 font-medium">
          Link resent — check your inbox (and spam folder).
        </p>
      ) : resendError ? (
        <p className="text-xs text-red-500">
          Could not resend the link.{' '}
          <a
            href={`/auth/signin?callbackUrl=${encodeURIComponent(`/run/${runId}/score`)}`}
            className="underline"
          >
            Sign in here instead.
          </a>
        </p>
      ) : (
        <button
          onClick={handleResend}
          disabled={resending}
          className="text-xs text-blue-600 hover:text-blue-700 disabled:opacity-50 transition-colors cursor-pointer"
        >
          {resending ? 'Sending…' : "Didn't get it? Resend sign-in link"}
        </button>
      )}

      <p className="mt-6 text-xs text-gray-400">
        Wrong email?{' '}
        <a href="/" className="hover:text-gray-600 transition-colors">
          Start over →
        </a>
      </p>
    </div>
  )
}
