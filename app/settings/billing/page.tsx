import { redirect } from 'next/navigation'
import { auth } from '@/app/lib/auth'
import prisma from '@/app/lib/prisma'
import { fetchVariantDetails, fetchCreditPacks } from '@/app/lib/billing'
import AppHeader from '@/app/components/AppHeader'
import BillingCTAs from './BillingCTAs'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PLAN_LABEL: Record<string, string> = {
  free:       'Free',
  starter:    'Starter',
  pro:        'Pro',
  enterprise: 'Enterprise',
}

const PLAN_PRICE: Record<string, string> = {
  free:       '$0 / mo',
  starter:    '$29 / mo',
  pro:        '$49 / mo',
  enterprise: 'Custom pricing',
}

const FALLBACK_PLAN_PRICES = {
  starter: { price: '$29', period: '/mo' },
  pro:     { price: '$49', period: '/mo' },
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(d: Date) {
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    active:   'text-green-700 bg-green-50 border-green-200',
    trialing: 'text-blue-700 bg-blue-50 border-blue-200',
    past_due: 'text-amber-700 bg-amber-50 border-amber-200',
    canceled: 'text-gray-500 bg-gray-50 border-gray-200',
    unpaid:   'text-red-700 bg-red-50 border-red-200',
    expired:  'text-gray-500 bg-gray-50 border-gray-200',
  }
  const labels: Record<string, string> = {
    active:   'Active',
    trialing: 'Trial',
    past_due: 'Past due',
    canceled: 'Cancelled',
    unpaid:   'Unpaid',
    expired:  'Expired',
  }
  return (
    <span className={`inline-flex items-center text-xs font-medium border px-2.5 py-1 rounded-full ${styles[status] ?? styles.active}`}>
      {labels[status] ?? status}
    </span>
  )
}

async function fetchPlanPrices() {
  const starterVariantId = process.env.LEMONSQUEEZY_STARTER_VARIANT_ID
  const proVariantId     = process.env.LEMONSQUEEZY_PRO_VARIANT_ID
  if (!starterVariantId || !proVariantId) return FALLBACK_PLAN_PRICES

  const [starter, pro] = await Promise.allSettled([
    fetchVariantDetails(starterVariantId),
    fetchVariantDetails(proVariantId),
  ])

  function fmt(
    r: PromiseSettledResult<{ price: number; interval: 'month' | 'year' | null }>,
    fallback: typeof FALLBACK_PLAN_PRICES.starter,
  ) {
    if (r.status !== 'fulfilled') return fallback
    const v = r.value
    return {
      price:  `$${Math.round(v.price / 100)}`,
      period: v.interval === 'month' ? '/mo' : v.interval === 'year' ? '/yr' : '',
    }
  }

  return {
    starter: fmt(starter, FALLBACK_PLAN_PRICES.starter),
    pro:     fmt(pro,     FALLBACK_PLAN_PRICES.pro),
  }
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function BillingPage() {
  const session = await auth()
  if (!session) redirect('/auth/signin?callbackUrl=/settings/billing')

  const orgId = session.user.orgId
  if (!orgId) {
    // Org bootstrap may have failed at sign-in — create it now and reload so
    // the session callback picks up the new orgId on the next request.
    try {
      const org = await prisma.organization.create({ data: { plan: 'free' } })
      await prisma.user.update({
        where: { id: session.user.id },
        data:  { orgId: org.id, role: 'admin' },
      })
    } catch { /* ignore — will redirect below */ }
    redirect('/settings/billing')
  }

  const creditsEnabled = process.env.ENABLE_CREDITS === 'true'

  const [org, subscription, planPrices, creditPacks] = await Promise.all([
    prisma.organization.findUnique({
      where:  { id: orgId },
      select: { plan: true, managedCreditsBalance: true, lsCustomerId: true, name: true },
    }),
    prisma.subscription.findUnique({
      where:  { orgId },
      select: { plan: true, status: true, currentPeriodEnd: true, cancelAtPeriodEnd: true },
    }),
    fetchPlanPrices(),
    creditsEnabled ? fetchCreditPacks() : Promise.resolve(null),
  ])

  if (!org) redirect('/')

  const plan   = org.plan as string
  const isFree = plan === 'free'

  return (
    <div className="min-h-screen bg-gray-50">
      <AppHeader
        userEmail={session.user.email}
        plan={plan}
        breadcrumb={[{ label: 'Settings' }, { label: 'Billing' }]}
      />

      <main className="max-w-2xl mx-auto px-4 py-10 space-y-6">

        {/* ── Plan card ──────────────────────────────────────────────────── */}
        <section className="bg-white border border-gray-200 rounded-2xl p-6 space-y-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs text-gray-400 uppercase tracking-wide font-medium mb-1">Current plan</p>
              <h2 className="text-xl font-bold text-gray-900">
                {PLAN_LABEL[plan] ?? plan}
              </h2>
              <p className="text-sm text-gray-500 mt-0.5">
                {plan === 'starter'
                  ? `${planPrices.starter.price}${planPrices.starter.period}`
                  : plan === 'pro'
                  ? `${planPrices.pro.price}${planPrices.pro.period}`
                  : PLAN_PRICE[plan] ?? ''}
              </p>
            </div>
            <div className="shrink-0">
              {subscription ? (
                <StatusBadge status={subscription.status} />
              ) : isFree ? (
                <span className="inline-flex items-center text-xs font-medium text-gray-500 bg-gray-100 px-2.5 py-1 rounded-full">
                  Free tier
                </span>
              ) : null}
            </div>
          </div>

          {subscription?.currentPeriodEnd && !subscription.cancelAtPeriodEnd && (
            <p className="text-xs text-gray-400">
              Renews {formatDate(subscription.currentPeriodEnd)}
            </p>
          )}
          {subscription?.cancelAtPeriodEnd && subscription.currentPeriodEnd && (
            <p className="text-xs text-amber-600">
              Cancels {formatDate(subscription.currentPeriodEnd)} — access continues until then.
            </p>
          )}

          {isFree && (
            <div className="p-3 bg-gray-50 rounded-xl">
              <p className="text-sm text-gray-600">
                Free plan: up to <span className="font-semibold">50 contacts per run</span>,{' '}
                <span className="font-semibold">1 scoring model</span>. No CSV export or AI messages.
              </p>
            </div>
          )}

          <BillingCTAs
            currentPlan={plan}
            lsCustomerId={org.lsCustomerId ?? null}
            creditsBalance={org.managedCreditsBalance}
            planPrices={planPrices}
            creditPacks={creditPacks}
          />
        </section>

      </main>
    </div>
  )
}
