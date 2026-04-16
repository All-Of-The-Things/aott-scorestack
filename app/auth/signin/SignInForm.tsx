'use client'

import { useState } from 'react'
import { signIn } from 'next-auth/react'

interface SignInFormProps {
  callbackUrl: string
}

type Step = 'idle' | 'submitting' | 'sent'

export default function SignInForm({ callbackUrl }: SignInFormProps) {
  const [email, setEmail] = useState('')
  const [step, setStep] = useState<Step>('idle')
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.trim()) return

    setError(null)
    setStep('submitting')

    try {
      const result = await signIn('resend', {
        email: email.trim(),
        redirect: false,
        callbackUrl,
      })

      if (result?.error) {
        console.error('[SignIn] signIn error:', result.error)
        setError('Could not send the sign-in link. Please try again.')
        setStep('idle')
        return
      }

      setStep('sent')
    } catch (err) {
      console.error('[SignIn] unexpected error:', err)
      setError('Something went wrong. Please try again.')
      setStep('idle')
    }
  }

  if (step === 'sent') {
    return (
      <div className="text-center">
        <div className="w-12 h-12 bg-green-50 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-6 h-6 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
        </div>
        <h1 className="text-lg font-semibold text-gray-900 mb-1">Check your inbox</h1>
        <p className="text-sm text-gray-500">
          We sent a sign-in link to{' '}
          <span className="font-medium text-gray-700">{email}</span>.
          Click it to continue.
        </p>
        <p className="mt-4 text-xs text-gray-400">
          Didn&apos;t receive it?{' '}
          <button onClick={() => setStep('idle')} className="text-blue-600 hover:underline">
            Try again
          </button>
        </p>
      </div>
    )
  }

  return (
    <>
      <h1 className="text-lg font-semibold text-gray-900 mb-1">Sign in</h1>
      <p className="text-sm text-gray-500 mb-6">
        Enter your email and we&apos;ll send you a sign-in link.
      </p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="email" className="block text-xs font-medium text-gray-600 mb-1.5">
            Email address
          </label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-shadow"
          />
        </div>

        {error && (
          <p className="text-xs text-red-600 bg-red-50 border border-red-100 px-3 py-2 rounded-lg">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={step === 'submitting' || !email.trim()}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white text-sm font-medium rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {step === 'submitting' ? (
            <>
              <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
              Sending…
            </>
          ) : (
            'Send sign-in link'
          )}
        </button>
      </form>
    </>
  )
}
