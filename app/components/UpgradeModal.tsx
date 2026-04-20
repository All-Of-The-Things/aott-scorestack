'use client'

import { useState, useEffect, useCallback } from 'react'

type PlanTier = 'free' | 'starter' | 'pro' | 'enterprise'

interface Props {
  trigger: string
  requiredPlan: 'starter' | 'pro'
  isOpen: boolean
  onClose: () => void
  currentPlan?: PlanTier
}

const PLAN_RANK: Record<PlanTier, number> = {
  free: 0,
  starter: 1,
  pro: 2,
  enterprise: 3,
}

const PLAN_FEATURES = [
  { label: 'Contacts per run',  free: '50',    starter: 'Unlimited', pro: 'Unlimited' },
  { label: 'Scoring models',    free: '1',     starter: '5',         pro: 'Unlimited' },
  { label: 'CSV export',        free: '—',     starter: '✓',         pro: '✓'         },
  { label: 'AI message gen',    free: '—',     starter: 'Basic',     pro: 'Custom'    },
  { label: 'LinkedIn delivery', free: '—',     starter: '—',         pro: '✓'         },
  { label: 'Team seats',        free: '1',     starter: '1',         pro: '3'         },
]

function userMessage(code: string, status: number): string {
  if (code === 'unauthorized')             return 'You need to be signed in to change your plan.'
  if (code === 'account_setup_incomplete') return 'Please finish setting up your workspace first.'
  if (code === 'checkout_failed')          return "We couldn't start the checkout. Double-check your billing settings."
  if (status >= 500)                       return 'Something went wrong on our end. Please try again in a moment.'
  return 'Something went wrong. Please try again.'
}

export default function UpgradeModal({ trigger, requiredPlan, isOpen, onClose, currentPlan }: Props) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Is the user already at or above the required plan tier?
  const alreadyHasAccess =
    currentPlan !== undefined &&
    PLAN_RANK[currentPlan] >= PLAN_RANK[requiredPlan]

  const handleUpgrade = useCallback(async (plan: 'starter' | 'pro') => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan }),
      })
      const data = await res.json()
      if (!res.ok) {
        console.error('[billing/checkout]', { status: res.status, body: data })
        setError(userMessage(data.error, res.status))
        setLoading(false)
        return
      }
      window.location.href = data.checkout_url
    } catch (err) {
      console.error('[billing/checkout] network error', err)
      setError('Network error — check your connection and try again.')
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!isOpen) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isOpen, onClose])

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-lg border border-gray-200 w-full max-w-lg p-6"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between mb-5">
          <div>
            <h2 className="text-base font-semibold text-gray-900">{trigger}</h2>
            {!alreadyHasAccess && (
              <p className="text-sm text-gray-500 mt-0.5">
                Available on {requiredPlan === 'starter' ? 'Starter and above' : 'Pro and above'}.
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors ml-4 shrink-0"
            aria-label="Close"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Already has access state */}
        {alreadyHasAccess ? (
          <div className="space-y-4">
            <div className="flex items-start gap-3 p-4 bg-green-50 border border-green-200 rounded-xl">
              <svg className="w-4 h-4 text-green-600 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div>
                <p className="text-sm font-medium text-green-800">You already have access</p>
                <p className="text-xs text-green-700 mt-0.5">
                  Your {currentPlan ? currentPlan.charAt(0).toUpperCase() + currentPlan.slice(1) : ''} plan includes this feature.
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="w-full py-2.5 text-sm font-medium text-gray-700 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-lg transition-colors"
            >
              Got it
            </button>
          </div>
        ) : (
          <>
            {/* Feature comparison table */}
            <div className="border border-gray-200 rounded-xl overflow-hidden mb-5">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="text-left px-3 py-2.5 text-gray-400 font-medium w-1/2">Feature</th>
                    <th className="px-3 py-2.5 text-center text-gray-500 font-medium">Free</th>
                    <th className={`px-3 py-2.5 text-center font-semibold ${
                      requiredPlan === 'starter' ? 'text-blue-700 bg-blue-50' : 'text-gray-500'
                    }`}>
                      Starter
                    </th>
                    <th className={`px-3 py-2.5 text-center font-semibold ${
                      requiredPlan === 'pro' ? 'text-purple-700 bg-purple-50' : 'text-gray-500'
                    }`}>
                      Pro
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {PLAN_FEATURES.map((row, i) => (
                    <tr key={row.label} className={i < PLAN_FEATURES.length - 1 ? 'border-b border-gray-50' : ''}>
                      <td className="px-3 py-2 text-gray-600">{row.label}</td>
                      <td className="px-3 py-2 text-center text-gray-400">{row.free}</td>
                      <td className={`px-3 py-2 text-center ${
                        requiredPlan === 'starter' ? 'bg-blue-50/50 text-blue-700' : 'text-gray-600'
                      }`}>
                        {row.starter}
                      </td>
                      <td className={`px-3 py-2 text-center ${
                        requiredPlan === 'pro' ? 'bg-purple-50/50 text-purple-700' : 'text-gray-600'
                      }`}>
                        {row.pro}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Error */}
            {error && (
              <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-100 rounded-lg mb-3">
                <svg className="w-4 h-4 text-red-500 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126z" />
                </svg>
                <p className="text-xs text-red-700">{error}</p>
              </div>
            )}

            {/* CTAs — only the minimum required plan CTA is primary */}
            <div className="flex flex-col gap-2">
              {requiredPlan === 'starter' && (
                <button
                  onClick={() => handleUpgrade('starter')}
                  disabled={loading}
                  className="w-full py-2.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-lg transition-colors"
                >
                  {loading ? 'Redirecting…' : 'Upgrade to Starter — $29/mo'}
                </button>
              )}
              <button
                onClick={() => handleUpgrade('pro')}
                disabled={loading}
                className={`w-full py-2.5 text-sm font-medium disabled:opacity-50 rounded-lg transition-colors ${
                  requiredPlan === 'pro'
                    ? 'text-white bg-purple-600 hover:bg-purple-700'
                    : 'text-purple-700 bg-purple-50 hover:bg-purple-100 border border-purple-100'
                }`}
              >
                {loading ? 'Redirecting…' : 'Upgrade to Pro — $49/mo'}
              </button>
              <button
                onClick={onClose}
                className="text-xs text-gray-400 hover:text-gray-600 py-1.5 transition-colors"
              >
                Maybe later
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
