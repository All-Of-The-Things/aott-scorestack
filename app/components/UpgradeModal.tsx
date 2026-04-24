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

export default function UpgradeModal({ trigger, requiredPlan, isOpen, onClose, currentPlan }: Props) {
  const [planPrices, setPlanPrices] = useState({ starter: '$29/mo', pro: '$49/mo' })

  useEffect(() => {
    if (!isOpen) return
    fetch('/api/billing/plans')
      .then((r) => r.json())
      .then((data) => {
        setPlanPrices({
          starter: `${data.starter.price}${data.starter.period}`,
          pro:     `${data.pro.price}${data.pro.period}`,
        })
      })
      .catch(() => {}) // keep hardcoded fallback on error
  }, [isOpen])

  // Is the user already at or above the required plan tier?
  const alreadyHasAccess =
    currentPlan !== undefined &&
    PLAN_RANK[currentPlan] >= PLAN_RANK[requiredPlan]

  const handleUpgrade = useCallback(() => {
    window.location.href = '/settings/billing'
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

            {/* CTAs — only the minimum required plan CTA is primary */}
            <div className="flex flex-col gap-2">
              {requiredPlan === 'starter' && (
                <button
                  onClick={handleUpgrade}
                  className="w-full py-2.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
                >
                  {`Upgrade to Starter — ${planPrices.starter}`}
                </button>
              )}
              <button
                onClick={handleUpgrade}
                className={`w-full py-2.5 text-sm font-medium rounded-lg transition-colors ${
                  requiredPlan === 'pro'
                    ? 'text-white bg-purple-600 hover:bg-purple-700'
                    : 'text-purple-700 bg-purple-50 hover:bg-purple-100 border border-purple-100'
                }`}
              >
                {`Upgrade to Pro — ${planPrices.pro}`}
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
