import { redirect } from 'next/navigation'
import { auth } from '@/app/lib/auth'
import prisma from '@/app/lib/prisma'
import { fetchPlanVariants, fetchCreditPacks } from '@/app/lib/billing'
import type { PlanVariant } from '@/app/lib/billing'
import AppHeader from '@/app/components/AppHeader'
import BillingCTAs from './BillingCTAs'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(d: Date) {
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
}

function formatVariantPrice(v: PlanVariant): string {
  if (v.price === 0) return '$0 forever'
  const dollars = `$${Math.round(v.price / 100)}`
  const period  = v.interval === 'month' ? '/mo' : v.interval === 'year' ? '/yr' : ''
  return `${dollars}${period}`
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

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function BillingPage() {
  const session = await auth()
  if (!session) redirect('/auth/signin?callbackUrl=/settings/billing')

  let orgId = session.user.orgId
  if (!orgId) {
    try {
      const org = await prisma.organization.create({ data: { plan: 'free' } })
      await prisma.user.update({
        where: { id: session.user.id },
        data:  { orgId: org.id, role: 'admin' },
      })
      orgId = org.id
    } catch (err) {
      console.error('[billing] org bootstrap failed:', err)
      redirect('/')
    }
  }

  const creditsEnabled = process.env.ENABLE_CREDITS === 'true'

  const [org, subscription, planVariants, creditPacks] = await Promise.all([
    prisma.organization.findUnique({
      where:  { id: orgId },
      select: { plan: true, managedCreditsBalance: true, lsCustomerId: true },
    }),
    prisma.subscription.findUnique({
      where:  { orgId },
      select: { plan: true, status: true, currentPeriodEnd: true, cancelAtPeriodEnd: true },
    }),
    fetchPlanVariants(),
    creditsEnabled ? fetchCreditPacks() : Promise.resolve(null),
  ])

  if (!org) redirect('/')

  const plan   = org.plan as string
  const isFree = plan === 'free'

  const currentVariant = planVariants.find((v) => v.plan === plan)

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
              <h2 className="text-xl font-bold text-gray-900 capitalize">
                {plan}
              </h2>
              <p className="text-sm text-gray-500 mt-0.5">
                {currentVariant
                  ? formatVariantPrice(currentVariant)
                  : plan === 'enterprise' ? 'Custom pricing' : ''}
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
            planVariants={planVariants}
            creditPacks={creditPacks}
            userEmail={session.user.email ?? null}
          />
        </section>

      </main>
    </div>
  )
}
