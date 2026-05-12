import { redirect } from 'next/navigation'
import { auth } from '@/app/lib/auth'
import prisma from '@/app/lib/prisma'
import AppHeader from '@/app/components/AppHeader'
import DeliveryJobsTable from '@/app/components/DeliveryJobsTable'
import UpgradePlanButton from '@/app/components/UpgradePlanButton'

const PRO_VARIANT_ID = process.env.NEXT_PUBLIC_LEMONSQUEEZY_PRO_VARIANT_ID ?? ''

export default async function DeliveryPage() {
  const session = await auth()
  if (!session) redirect('/auth/signin?callbackUrl=/delivery')

  const isPro = session.user.plan === 'pro' || session.user.plan === 'enterprise'

  if (!isPro) {
    return (
      <div className="min-h-screen bg-gray-50">
        <AppHeader userEmail={session.user.email} plan={session.user.plan} orgName={session.user.orgName} role={session.user.role} />
        <main className="max-w-5xl mx-auto px-4 py-8">
          <div className="mb-6">
            <h1 className="text-lg font-semibold text-gray-900">Deliveries</h1>
            <p className="text-sm text-gray-500 mt-0.5">Track your sent message campaigns</p>
          </div>
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-10 text-center">
            <div className="w-12 h-12 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-6 h-6 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
              </svg>
            </div>
            <h3 className="text-sm font-semibold text-gray-900 mb-1">Unlock LinkedIn Delivery</h3>
            <p className="text-xs text-gray-500 max-w-xs mx-auto mb-5">
              Deliveries will appear here once you send messages from a scored run. Sending is available on the Pro plan.
            </p>
            <UpgradePlanButton variantId={PRO_VARIANT_ID} label="Upgrade to Pro" />
          </div>
        </main>
      </div>
    )
  }

  const orgId = session.user.orgId
  const rawJobs = orgId
    ? await prisma.deliveryJob.findMany({
        where: { orgId },
        include: { run: { select: { name: true, originalFilename: true } } },
        orderBy: { createdAt: 'desc' },
      })
    : []

  const jobs = rawJobs.map((j) => ({
    ...j,
    scheduledAt: j.scheduledAt?.toISOString() ?? null,
    startedAt: j.startedAt?.toISOString() ?? null,
    completedAt: j.completedAt?.toISOString() ?? null,
    createdAt: j.createdAt.toISOString(),
  }))

  return (
    <div className="min-h-screen bg-gray-50">
      <AppHeader
        userEmail={session.user.email}
        plan={session.user.plan}
      />
      <main className="max-w-5xl mx-auto px-4 py-8">
        <div className="mb-6">
          <h1 className="text-lg font-semibold text-gray-900">Deliveries</h1>
          <p className="text-sm text-gray-500 mt-0.5">Track your sent message campaigns</p>
        </div>
        <DeliveryJobsTable initialJobs={jobs} />
      </main>
    </div>
  )
}
