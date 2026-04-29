import { redirect } from 'next/navigation'
import { auth } from '@/app/lib/auth'
import prisma from '@/app/lib/prisma'
import AppHeader from '@/app/components/AppHeader'
import DeliveryJobsTable from '@/app/components/DeliveryJobsTable'

export default async function DeliveryPage() {
  const session = await auth()
  if (!session) redirect('/auth/signin?callbackUrl=/delivery')

  if (session.user.plan !== 'pro' && session.user.plan !== 'enterprise') {
    redirect('/settings/billing')
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
          <h1 className="text-lg font-semibold text-gray-900">LinkedIn Delivery</h1>
          <p className="text-sm text-gray-500 mt-0.5">Track your sent message campaigns</p>
        </div>
        <DeliveryJobsTable initialJobs={jobs} />
      </main>
    </div>
  )
}
