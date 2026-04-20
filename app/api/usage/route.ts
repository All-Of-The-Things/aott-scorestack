import { NextResponse } from 'next/server'
import { auth } from '@/app/lib/auth'
import prisma from '@/app/lib/prisma'

const PLAN_MODEL_LIMITS: Record<string, number> = {
  free: 1,
  starter: 5,
  pro: -1,
  enterprise: -1,
}

const PLAN_SEAT_LIMITS: Record<string, number> = {
  free: 1,
  starter: 1,
  pro: 3,
  enterprise: -1,
}

const PLAN_RUN_LIMITS: Record<string, number> = {
  free: 50,
  starter: -1,
  pro: -1,
  enterprise: -1,
}

export async function GET() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const orgId = session.user.orgId
  if (!orgId) return NextResponse.json({ error: 'account_setup_incomplete' }, { status: 503 })

  const [org, modelsUsed, seats] = await Promise.all([
    prisma.organization.findUnique({
      where: { id: orgId },
      select: { plan: true, managedCreditsBalance: true },
    }),
    prisma.scoringModel.count({ where: { orgId } }),
    prisma.user.count({ where: { orgId } }),
  ])

  if (!org) return NextResponse.json({ error: 'org_not_found' }, { status: 404 })

  const plan = org.plan as string

  return NextResponse.json({
    plan,
    managedCreditsBalance: org.managedCreditsBalance,
    contactsPerRunLimit: PLAN_RUN_LIMITS[plan] ?? 50,
    modelsUsed,
    modelsLimit: PLAN_MODEL_LIMITS[plan] ?? 1,
    seats,
    seatsLimit: PLAN_SEAT_LIMITS[plan] ?? 1,
  })
}
