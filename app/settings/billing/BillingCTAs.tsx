'use client'

import { useState } from 'react'
import type { CreditPackId } from '@/app/lib/billing'

// ---------------------------------------------------------------------------
// Types + constants
// ---------------------------------------------------------------------------

type SelectablePlan = 'free' | 'starter' | 'pro'

const PLAN_RANK: Record<string, number> = { free: 0, starter: 1, pro: 2, enterprise: 3 }

const PLANS: {
  id: SelectablePlan
  name: string
  price: string
  period: string
  highlights: string[]
}[] = [
  {
    id: 'free',
    name: 'Free',
    price: '$0',
    period: 'forever',
    highlights: ['50 contacts per run', '1 scoring model', 'No CSV export'],
  },
  {
    id: 'starter',
    name: 'Starter',
    price: '$29',
    period: '/mo',
    highlights: ['Unlimited contacts', '5 scoring models', 'CSV export', 'AI messages'],
  },
  {
    id: 'pro',
    name: 'Pro',
    price: '$49',
    period: '/mo',
    highlights: ['Everything in Starter', 'Custom AI templates', 'LinkedIn delivery', '3 team seats'],
  },
]

const CREDIT_PACKS: { packId: CreditPackId; credits: number; price: string }[] = [
  { packId: 'credits_100',  credits: 100,  price: '$6'   },
  { packId: 'credits_500',  credits: 500,  price: '$25'  },
  { packId: 'credits_1500', credits: 1500, price: '$60'  },
  { packId: 'credits_5000', credits: 5000, price: '$175' },
]

// ---------------------------------------------------------------------------
// Error helper — friendly copy for users, raw detail to console
// ---------------------------------------------------------------------------

function userMessage(code: string, status: number): string {
  if (code === 'unauthorized')               return 'You need to be signed in to change your plan.'
  if (code === 'account_setup_incomplete')   return 'Please finish setting up your workspace first.'
  if (code === 'checkout_failed')            return "We couldn't start the checkout. Double-check your billing settings."
  if (code === 'no_billing_account')         return 'No billing account linked yet. Contact support if this keeps happening.'
  if (code === 'portal_failed')              return "We couldn't open the billing portal. Try again in a moment."
  if (status >= 500)                         return 'Something went wrong on our end. Please try again in a moment.'
  return 'Something went wrong. Please try again.'
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface Props {
  currentPlan: string
  lsCustomerId: string | null
  creditsBalance: number
}

export default function BillingCTAs({ currentPlan, lsCustomerId, creditsBalance }: Props) {
  const normalised: SelectablePlan =
    currentPlan === 'starter' || currentPlan === 'pro' ? currentPlan : 'free'

  const [selected, setSelected] = useState<SelectablePlan>(normalised)
  const [loading, setLoading]   = useState<string | null>(null)
  const [error, setError]       = useState<string | null>(null)

  const currentRank  = PLAN_RANK[currentPlan] ?? 0
  const selectedRank = PLAN_RANK[selected]    ?? 0
  const isUpgrade    = selectedRank > currentRank
  const isDowngrade  = selectedRank < currentRank
  const isSame       = selected === normalised || (currentPlan === 'enterprise' && !isUpgrade)

  const isPaid = currentPlan === 'starter' || currentPlan === 'pro'

  function creditBarColor(n: number) {
    if (n > 200) return 'bg-green-500'
    if (n > 50)  return 'bg-amber-400'
    return 'bg-red-500'
  }

  // -------------------------------------------------------------------------
  // Actions
  // -------------------------------------------------------------------------

  async function doCheckout() {
    setLoading('checkout')
    setError(null)
    try {
      const res  = await fetch('/api/billing/checkout', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ plan: selected }),
      })
      const data = await res.json()
      if (!res.ok) {
        console.error('[billing/checkout]', { status: res.status, body: data })
        setError(userMessage(data.error, res.status))
        return
      }
      window.location.href = data.checkout_url
    } catch (err) {
      console.error('[billing/checkout] network error', err)
      setError('Network error — check your connection and try again.')
    } finally {
      setLoading(null)
    }
  }

  async function doPortal() {
    setLoading('portal')
    setError(null)
    try {
      const res  = await fetch('/api/billing/portal', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) {
        console.error('[billing/portal]', { status: res.status, body: data })
        setError(userMessage(data.error, res.status))
        return
      }
      window.location.href = data.portal_url
    } catch (err) {
      console.error('[billing/portal] network error', err)
      setError('Network error — check your connection and try again.')
    } finally {
      setLoading(null)
    }
  }

  async function doBuyCredits(packId: CreditPackId) {
    setLoading(packId)
    setError(null)
    try {
      const res  = await fetch('/api/billing/credits', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ packId }),
      })
      const data = await res.json()
      if (!res.ok) {
        console.error('[billing/credits]', { packId, status: res.status, body: data })
        setError(userMessage(data.error, res.status))
        return
      }
      window.location.href = data.checkout_url
    } catch (err) {
      console.error('[billing/credits] network error', err)
      setError('Network error — check your connection and try again.')
    } finally {
      setLoading(null)
    }
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  const upgradePlan = PLANS.find((p) => p.id === selected)

  return (
    <div className="space-y-6">

      {/* ── Plan selector ─────────────────────────────────────────────────── */}
      <div>
        <p className="text-xs font-medium text-gray-500 mb-2">Select a plan</p>
        <div className="space-y-2">
          {PLANS.map((plan) => {
            const isCurrent  = plan.id === normalised || (currentPlan === 'enterprise' && plan.id === 'pro')
            const isSelected = plan.id === selected

            return (
              <button
                key={plan.id}
                type="button"
                onClick={() => setSelected(plan.id)}
                className={`w-full text-left flex items-start gap-3 px-4 py-3 rounded-xl border transition-all ${
                  isSelected
                    ? 'border-blue-500 bg-blue-50/60 ring-1 ring-blue-400'
                    : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50'
                }`}
              >
                {/* Radio dot */}
                <span
                  className={`mt-0.5 w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${
                    isSelected ? 'border-blue-500' : 'border-gray-300'
                  }`}
                >
                  {isSelected && (
                    <span className="w-2 h-2 rounded-full bg-blue-500" />
                  )}
                </span>

                {/* Plan info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-sm font-semibold ${isSelected ? 'text-blue-800' : 'text-gray-800'}`}>
                      {plan.name}
                    </span>
                    <span className={`text-sm ${isSelected ? 'text-blue-700' : 'text-gray-500'}`}>
                      {plan.price}
                      <span className="text-xs">{plan.period}</span>
                    </span>
                    {isCurrent && (
                      <span className="text-[10px] font-semibold uppercase tracking-wide text-green-700 bg-green-100 px-1.5 py-0.5 rounded-full">
                        Current
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5 leading-relaxed">
                    {plan.highlights.join(' · ')}
                  </p>
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {/* ── Error ─────────────────────────────────────────────────────────── */}
      {error && (
        <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-100 rounded-xl">
          <svg className="w-4 h-4 text-red-400 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126z" />
          </svg>
          <p className="text-xs text-red-700">{error}</p>
        </div>
      )}

      {/* ── Confirmation button ────────────────────────────────────────────── */}
      {isUpgrade && upgradePlan && (
        <button
          onClick={doCheckout}
          disabled={!!loading}
          className="w-full py-2.5 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-xl transition-colors"
        >
          {loading === 'checkout'
            ? 'Redirecting to checkout…'
            : `Upgrade to ${upgradePlan.name} — ${upgradePlan.price}${upgradePlan.period}`}
        </button>
      )}

      {isSame && !isUpgrade && !isDowngrade && (
        <p className="text-xs text-gray-400 text-center py-1">
          {currentPlan === 'enterprise'
            ? "You're on the Enterprise plan. Contact us to make changes."
            : `${PLANS.find((p) => p.id === normalised)?.name ?? 'This'} is your current plan.`}
        </p>
      )}

      {isDowngrade && (
        <p className="text-xs text-gray-500 text-center py-1">
          To downgrade, manage your subscription through the billing portal.
        </p>
      )}

      {/* ── Portal link ───────────────────────────────────────────────────── */}
      {isPaid && (
        <div className="pt-1">
          {lsCustomerId ? (
            <button
              onClick={doPortal}
              disabled={!!loading}
              className="w-full py-2 text-sm text-gray-600 hover:text-gray-800 bg-white hover:bg-gray-50 border border-gray-200 disabled:opacity-50 rounded-xl transition-colors"
            >
              {loading === 'portal' ? 'Opening…' : 'Manage invoices & payment'}
            </button>
          ) : (
            <p className="text-xs text-gray-400 text-center">
              Billing portal loading — refresh in a moment or contact support.
            </p>
          )}
        </div>
      )}

      {/* ── Enrichment credits (paid plans) ──────────────────────────────── */}
      {isPaid && (
        <div className="pt-4 border-t border-gray-100 space-y-3">
          <div className="flex items-baseline justify-between">
            <p className="text-xs font-medium text-gray-500">Enrichment credits</p>
            <p className="text-sm font-semibold text-gray-800">
              {creditsBalance.toLocaleString()} remaining
            </p>
          </div>

          <div>
            <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${creditBarColor(creditsBalance)}`}
                style={{ width: `${Math.min(100, (creditsBalance / 500) * 100)}%` }}
              />
            </div>
            <p className="mt-1 text-xs text-gray-400">
              {creditsBalance === 0
                ? "You're out of credits — buy a pack to keep enriching."
                : creditsBalance <= 50
                  ? 'Almost out — top up soon.'
                  : creditsBalance <= 200
                    ? 'Running a bit low.'
                    : 'Plenty of credits remaining.'}
            </p>
          </div>

          <p className="text-xs font-medium text-gray-500">Buy more credits</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {CREDIT_PACKS.map((pack) => (
              <button
                key={pack.packId}
                onClick={() => doBuyCredits(pack.packId)}
                disabled={!!loading}
                className="text-left p-3 rounded-xl border border-gray-200 hover:border-blue-300 hover:bg-blue-50 disabled:opacity-50 transition-colors group"
              >
                <p className="text-xs font-semibold text-gray-800 group-hover:text-blue-700">
                  {loading === pack.packId ? '…' : `${pack.credits.toLocaleString()} cr`}
                </p>
                <p className="text-xs text-gray-400 mt-0.5">{pack.price}</p>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
