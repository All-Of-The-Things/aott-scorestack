import { redirect } from 'next/navigation'
import { auth } from '@/app/lib/auth'
import prisma from '@/app/lib/prisma'
import AppHeader from '@/app/components/AppHeader'
import BillingCTAs from './BillingCTAs'

const PLAN_LABEL: Record<string, string> = {
  free: 'Free',
  starter: 'Starter',
  pro: 'Pro',
  enterprise: 'Enterprise',
}

const PLAN_PRICE: Record<string, string> = {
  free: '$0 / mo',
  starter: '$29 / mo',
  pro: '$49 / mo',
  enterprise: 'Custom pricing',
}

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
  const cls = styles[status] ?? styles.active
  return (
    <span className={`inline-flex items-center text-xs font-medium border px-2.5 py-1 rounded-full ${cls}`}>
      {labels[status] ?? status}
    </span>
  )
}

export default async function BillingPage({
  searchParams,
}: {
  searchParams: { success?: string }
}) {
  const session = await auth()
  if (!session) redirect('/auth/signin?callbackUrl=/settings/billing')

  const orgId = session.user.orgId
  if (!orgId) redirect('/onboarding')

  const [org, subscription] = await Promise.all([
    prisma.organization.findUnique({
      where: { id: orgId },
      select: { plan: true, managedCreditsBalance: true, lsCustomerId: true, name: true },
    }),
    prisma.subscription.findUnique({
      where: { orgId },
      select: { plan: true, status: true, currentPeriodEnd: true, cancelAtPeriodEnd: true },
    }),
  ])

  if (!org) redirect('/')

  const plan = org.plan as string
  const isFree = plan === 'free'
  const showSuccess = searchParams.success === '1'

  return (
    <div className="min-h-screen bg-gray-50">
      <AppHeader
        userEmail={session.user.email}
        breadcrumb={[{ label: 'Settings' }, { label: 'Billing' }]}
      />

      <main className="max-w-2xl mx-auto px-4 py-10 space-y-6">

        {/* Success banner */}
        {showSuccess && (
          <div className="flex items-start gap-3 p-4 bg-green-50 border border-green-200 rounded-xl">
            <svg className="w-4 h-4 text-green-600 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-sm text-green-800">
              Payment received — your plan will be updated shortly.
            </p>
          </div>
        )}

        {/* Plan card */}
        <section className="bg-white border border-gray-200 rounded-2xl p-6 space-y-5">
          {/* Plan header */}
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs text-gray-400 uppercase tracking-wide font-medium mb-1">Current plan</p>
              <h2 className="text-xl font-bold text-gray-900">
                {PLAN_LABEL[plan] ?? plan}
              </h2>
              <p className="text-sm text-gray-500 mt-0.5">{PLAN_PRICE[plan] ?? ''}</p>
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

          {/* Renewal / cancellation date */}
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

          {/* Free plan info block */}
          {isFree && (
            <div className="p-3 bg-gray-50 rounded-xl">
              <p className="text-sm text-gray-600">
                Free plan: up to <span className="font-semibold">50 contacts per run</span>,{' '}
                <span className="font-semibold">1 scoring model</span>. No CSV export or AI messages.
              </p>
            </div>
          )}

          {/* All interactive billing CTAs — client component */}
          <BillingCTAs
            plan={plan}
            lsCustomerId={org.lsCustomerId ?? null}
            creditsBalance={org.managedCreditsBalance}
          />
        </section>

      </main>
    </div>
  )
}
