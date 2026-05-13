import { NextResponse } from 'next/server'
import { auth } from '@/app/lib/auth'
import prisma from '@/app/lib/prisma'

export async function GET() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { orgId, plan } = session.user
  if (!orgId) return NextResponse.json({ error: 'account_setup_incomplete' }, { status: 503 })

  const isPro = plan === 'pro' || plan === 'enterprise'
  if (!isPro) return NextResponse.json({ error: 'plan_required', requiredPlan: 'pro' }, { status: 403 })

  const members = await prisma.user.findMany({
    where: { orgId },
    select: { id: true, email: true, name: true, role: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  })

  return NextResponse.json({ members })
}
