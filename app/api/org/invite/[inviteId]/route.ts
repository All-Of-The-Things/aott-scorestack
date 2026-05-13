import { NextResponse } from 'next/server'
import { auth } from '@/app/lib/auth'
import prisma from '@/app/lib/prisma'

export async function DELETE(_req: Request, { params }: { params: { inviteId: string } }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { orgId, role, plan } = session.user
  if (!orgId) return NextResponse.json({ error: 'account_setup_incomplete' }, { status: 503 })
  if (role !== 'admin') return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const isPro = plan === 'pro' || plan === 'enterprise'
  if (!isPro) return NextResponse.json({ error: 'plan_required', requiredPlan: 'pro' }, { status: 403 })

  const { inviteId } = params

  const invite = await prisma.orgInvite.findFirst({ where: { id: inviteId, orgId } })
  if (!invite) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  await prisma.orgInvite.delete({ where: { id: inviteId } })

  return NextResponse.json({ cancelled: true })
}
