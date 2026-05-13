import { NextResponse } from 'next/server'
import { auth } from '@/app/lib/auth'
import prisma from '@/app/lib/prisma'

export async function DELETE(_req: Request, { params }: { params: { userId: string } }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { orgId, role, plan, id: sessionUserId } = session.user
  if (!orgId) return NextResponse.json({ error: 'account_setup_incomplete' }, { status: 503 })
  if (role !== 'admin') return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const isPro = plan === 'pro' || plan === 'enterprise'
  if (!isPro) return NextResponse.json({ error: 'plan_required', requiredPlan: 'pro' }, { status: 403 })

  const { userId } = params

  if (userId === sessionUserId) {
    return NextResponse.json({ error: 'cannot_remove_self' }, { status: 400 })
  }

  // Verify target belongs to this org before modifying
  const target = await prisma.user.findFirst({ where: { id: userId, orgId } })
  if (!target) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  await prisma.user.update({
    where: { id: userId },
    data: { orgId: null, role: 'member' },
  })

  return NextResponse.json({ removed: true })
}
