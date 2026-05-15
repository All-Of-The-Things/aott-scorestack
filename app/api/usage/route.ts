import { NextResponse } from 'next/server'
import { auth } from '@/app/lib/auth'
import prisma from '@/app/lib/prisma'
import { getPlanLimitsFor } from '@/app/lib/quota'

export async function GET() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const orgId = session.user.orgId
  if (!orgId) return NextResponse.json({ error: 'account_setup_incomplete' }, { status: 503 })

  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: { plan: true, managedCreditsBalance: true },
  })
  if (!org) return NextResponse.json({ error: 'org_not_found' }, { status: 404 })

  const plan   = org.plan as string
  const isFree = plan === 'free'

  const [modelsUsed, seats, runCount, limits] = await Promise.all([
    prisma.scoringModel.count({ where: { orgId } }),
    prisma.user.count({ where: { orgId } }),
    isFree
      ? prisma.run.count({ where: { orgId, status: { in: ['enriching', 'scoring', 'complete'] } } })
      : Promise.resolve(null),
    getPlanLimitsFor(plan),
  ])

  return NextResponse.json({
    plan,
    managedCreditsBalance: org.managedCreditsBalance,
    contactsPerRunLimit: limits.runLimit,
    modelsUsed,
    modelsLimit: limits.modelLimit,
    seats,
    seatsLimit: limits.seatLimit,
    runCount,
  })
}
