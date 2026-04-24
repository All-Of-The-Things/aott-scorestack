'use client'

import { useState } from 'react'
import type { PlanVariant, CreditPack } from '@/app/lib/billing'

// ---------------------------------------------------------------------------
// Types + constants
// ---------------------------------------------------------------------------

type KnownPlan = 'free' | 'starter' | 'pro' | 'enterprise'

const PLAN_HIGHLIGHTS: Record<string, string[]> = {
  free:       ['50 contacts per run', '1 scoring model', 'No CSV export'],
  starter:    ['Unlimited contacts', '5 scoring models', 'CSV export', 'AI messages'],
  pro:        ['Everything in Starter', 'Custom AI templates', 'LinkedIn delivery', '3 team seats'],
  enterprise: ['Unlimited seats', 'CRM integrations', 'API access', 'SSO + white-label', 'Dedicated support & SLA'],
}

// Enterprise is always appended as the last option regardless of what LS returns.
const ENTERPRISE_OPTION = {
  id:       'enterprise' as const,
  name:     'Enterprise',
  price:    null as null,
  period:   null as null,
  variantId: null as null,
}

// ---------------------------------------------------------------------------
// Error helper
// ---------------------------------------------------------------------------

function userMessage(code: string, status: number): string {
  if (code === 'unauthorized')               return 'You need to be signed in to change your plan.'
  if (code === 'account_setup_incomplete')   return 'Account setup is still in progress. Please refresh and try again.'
  if (code === 'checkout_failed')            return "We couldn't start the checkout. Double-check your billing settings."
  if (code === 'no_billing_account')         return 'No billing account linked yet. Contact support if this keeps happening.'
  if (code === 'portal_failed')              return "We couldn't open the billing portal. Try again in a moment."
  if (status >= 500)                         return 'Something went wrong on our end. Please try again in a moment.'
  return 'Something went wrong. Please try again.'
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface Props {
  currentPlan:    string
  lsCustomerId:   string | null
  creditsBalance: number
  planVariants:   PlanVariant[]
  creditPacks:    CreditPack[] | null
  userEmail:      string | null
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function BillingCTAs({
  currentPlan,
  lsCustomerId,
  creditsBalance,
  planVariants,
  creditPacks,
  userEmail,
}: Props) {
  // Normalise current plan to a selectable key; unknown plans (enterprise) stay as-is.
  const normalisedCurrent: KnownPlan =
    (['free', 'starter', 'pro', 'enterprise'] as KnownPlan[]).includes(currentPlan as KnownPlan)
      ? (currentPlan as KnownPlan)
      : 'free'

  // Build display list: LS variants (sorted by price asc) + hardcoded Enterprise.
  const planOptions = [
    ...planVariants.map((v) => ({
      id:        v.plan as KnownPlan,
      name:      v.name,
      price:     v.price === 0 ? '$0' : `$${Math.round(v.price / 100)}`,
      period:    v.price === 0 ? 'forever' : v.interval === 'month' ? '/mo' : v.interval === 'year' ? '/yr' : '',
      variantId: v.variantId,
    })),
    ENTERPRISE_OPTION,
  ]

  // Rank by position in planOptions (Enterprise is always last).
  const planRank = Object.fromEntries(planOptions.map((p, i) => [p.id, i]))

  const [selected, setSelected]       = useState<KnownPlan>(normalisedCurrent)
  const [loading, setLoading]         = useState<string | null>(null)
  const [error, setError]             = useState<string | null>(null)
  // Contact form state (Enterprise)
  const [contactEmail, setContactEmail] = useState(userEmail ?? '')
  const [contactMessage, setContactMessage] = useState('')
  const [inquirySent, setInquirySent] = useState(false)

  const currentRank  = planRank[currentPlan]  ?? 0
  const selectedRank = planRank[selected]     ?? 0
  const isUpgrade    = selectedRank > currentRank
  const isDowngrade  = selectedRank < currentRank
  const isSame       = selected === normalisedCurrent

  const isPaid = currentPlan === 'starter' || currentPlan === 'pro'

  const selectedOption = planOptions.find((p) => p.id === selected)

  function creditBarColor(n: number) {
    if (n > 200) return 'bg-green-500'
    if (n > 50)  return 'bg-amber-400'
    return 'bg-red-500'
  }

  // -------------------------------------------------------------------------
  // Actions
  // -------------------------------------------------------------------------

  async function doCheckout() {
    if (!selectedOption?.variantId) return
    setLoading('checkout')
    setError(null)
    try {
      const res  = await fetch('/api/billing/checkout', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ variantId: selectedOption.variantId }),
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

  async function doBuyCredits(variantId: string, credits: number) {
    setLoading(variantId)
    setError(null)
    try {
      const res  = await fetch('/api/billing/credits', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ variantId, credits }),
      })
      const data = await res.json()
      if (!res.ok) {
        console.error('[billing/credits]', { variantId, status: res.status, body: data })
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

  async function doEnterpriseInquiry() {
    setLoading('inquiry')
    setError(null)
    try {
      const res = await fetch('/api/inquiries/enterprise', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ email: contactEmail.trim(), message: contactMessage.trim() }),
      })
      if (!res.ok) {
        const data = await res.json()
        setError(userMessage(data.error, res.status))
        return
      }
      setInquirySent(true)
    } catch (err) {
      console.error('[inquiries/enterprise] network error', err)
      setError('Network error — check your connection and try again.')
    } finally {
      setLoading(null)
    }
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <div className="space-y-6">

      {/* ── Plan selector ─────────────────────────────────────────────────── */}
      <div>
        <p className="text-xs font-medium text-gray-500 mb-2">Select a plan</p>
        {planOptions.length === 1 /* only enterprise, LS not configured */ ? (
          <p className="text-xs text-gray-400 py-2">Plan options are unavailable right now.</p>
        ) : (
          <div className="space-y-2">
            {planOptions.map((option) => {
              const isCurrent  = option.id === normalisedCurrent
              const isSelected = option.id === selected

              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => setSelected(option.id)}
                  className={`w-full text-left flex items-start gap-3 px-4 py-3 rounded-xl border transition-all ${
                    isSelected
                      ? 'border-blue-500 bg-blue-50/60 ring-1 ring-blue-400'
                      : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  {/* Radio dot */}
                  <span className={`mt-0.5 w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${
                    isSelected ? 'border-blue-500' : 'border-gray-300'
                  }`}>
                    {isSelected && <span className="w-2 h-2 rounded-full bg-blue-500" />}
                  </span>

                  {/* Plan info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-sm font-semibold ${isSelected ? 'text-blue-800' : 'text-gray-800'}`}>
                        {option.name}
                      </span>
                      {option.price !== null ? (
                        <span className={`text-sm ${isSelected ? 'text-blue-700' : 'text-gray-500'}`}>
                          {option.price}<span className="text-xs">{option.period}</span>
                        </span>
                      ) : (
                        <span className="text-xs text-gray-400 italic">Custom pricing</span>
                      )}
                      {isCurrent && (
                        <span className="text-[10px] font-semibold uppercase tracking-wide text-green-700 bg-green-100 px-1.5 py-0.5 rounded-full">
                          Current
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5 leading-relaxed">
                      {(PLAN_HIGHLIGHTS[option.id] ?? []).join(' · ')}
                    </p>
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* ── Enterprise contact form ────────────────────────────────────────── */}
      {selected === 'enterprise' && (
        <div className="space-y-3 p-4 bg-gray-50 rounded-xl border border-gray-200">
          {inquirySent ? (
            <div className="py-2 text-center space-y-1">
              <p className="text-sm font-semibold text-gray-800">Inquiry sent!</p>
              <p className="text-xs text-gray-500">We&apos;ll get back to you within one business day.</p>
            </div>
          ) : (
            <>
              <div>
                <p className="text-sm font-semibold text-gray-800">Get in touch</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  Tell us about your team and we&apos;ll get back to you within one business day.
                </p>
              </div>
              <input
                type="email"
                value={contactEmail}
                onChange={(e) => setContactEmail(e.target.value)}
                placeholder="your@email.com"
                className="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <textarea
                rows={3}
                value={contactMessage}
                onChange={(e) => setContactMessage(e.target.value)}
                placeholder="Tell us about your team size, use case, and any specific requirements…"
                className="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
              />
              <button
                type="button"
                disabled={!contactEmail.trim() || !!loading}
                onClick={doEnterpriseInquiry}
                className="w-full py-2.5 text-sm font-semibold text-white bg-gray-800 hover:bg-gray-900 disabled:opacity-50 rounded-xl transition-colors"
              >
                {loading === 'inquiry' ? 'Sending…' : 'Send inquiry →'}
              </button>
            </>
          )}
        </div>
      )}

      {/* ── Error ─────────────────────────────────────────────────────────── */}
      {error && (
        <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-100 rounded-xl">
          <svg className="w-4 h-4 text-red-400 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126z" />
          </svg>
          <p className="text-xs text-red-700">{error}</p>
        </div>
      )}

      {/* ── Action row ────────────────────────────────────────────────────── */}
      {selected !== 'enterprise' && (
        <>
          {isUpgrade && selectedOption?.variantId && (
            <button
              onClick={doCheckout}
              disabled={!!loading}
              className="w-full py-2.5 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-xl transition-colors"
            >
              {loading === 'checkout'
                ? 'Redirecting to checkout…'
                : `Upgrade to ${selectedOption.name} — ${selectedOption.price}${selectedOption.period}`}
            </button>
          )}

          {isSame && (
            <p className="text-xs text-gray-400 text-center py-1">
              {currentPlan === 'enterprise'
                ? "You're on the Enterprise plan. Contact us to make changes."
                : `${selectedOption?.name ?? 'This'} is your current plan.`}
            </p>
          )}

          {isDowngrade && (
            <p className="text-xs text-gray-500 text-center py-1">
              To downgrade, manage your subscription through the billing portal.
            </p>
          )}
        </>
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
            <div className="w-full py-2 flex items-center justify-between px-3 border border-dashed border-gray-200 rounded-xl">
              <span className="text-sm text-gray-400">Manage invoices &amp; payment</span>
              <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded-full">Soon</span>
            </div>
          )}
        </div>
      )}

      {/* ── Enrichment credits (paid plans, feature-flagged) ─────────────── */}
      {isPaid && creditPacks !== null && creditPacks.length > 0 && (
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
            {creditPacks.map((pack) => (
              <button
                key={pack.variantId}
                onClick={() => doBuyCredits(pack.variantId, pack.credits)}
                disabled={!!loading}
                className="text-left p-3 rounded-xl border border-gray-200 hover:border-blue-300 hover:bg-blue-50 disabled:opacity-50 transition-colors group"
              >
                <p className="text-xs font-semibold text-gray-800 group-hover:text-blue-700">
                  {loading === pack.variantId ? '…' : pack.name}
                </p>
                <p className="text-xs text-gray-400 mt-0.5">${Math.round(pack.price / 100)}</p>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
