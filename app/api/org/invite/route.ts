import { NextResponse } from 'next/server'
import { auth } from '@/app/lib/auth'
import prisma from '@/app/lib/prisma'
import { sendOrgInvite } from '@/app/lib/notify'
import { getPlanLimitsFor } from '@/app/lib/quota'

export async function POST(req: Request) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { orgId, role, plan } = session.user
  if (!orgId) return NextResponse.json({ error: 'account_setup_incomplete' }, { status: 503 })
  if (role !== 'admin') return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const isPro = plan === 'pro' || plan === 'enterprise'
  if (!isPro) return NextResponse.json({ error: 'plan_required', requiredPlan: 'pro' }, { status: 403 })

  const body = await req.json() as { email?: string; role?: string }
  const inviteEmail = body.email?.toLowerCase().trim()
  const inviteRole  = body.role === 'admin' ? 'admin' : 'member'

  if (!inviteEmail) return NextResponse.json({ error: 'email_required' }, { status: 400 })

  const existing = await prisma.user.findFirst({ where: { email: inviteEmail, orgId } })
  if (existing) return NextResponse.json({ error: 'already_member' }, { status: 409 })

  const pendingInvite = await prisma.orgInvite.findFirst({ where: { email: inviteEmail, orgId, expires: { gte: new Date() } } })
  if (pendingInvite) return NextResponse.json({ error: 'already_invited' }, { status: 409 })

  const planLimits = await getPlanLimitsFor(plan)
  if (planLimits.seatLimit !== -1) {
    const currentSeats = await prisma.user.count({ where: { orgId } })
    if (currentSeats >= planLimits.seatLimit) {
      return NextResponse.json({ error: 'seat_limit_reached', limit: planLimits.seatLimit }, { status: 409 })
    }
  }

  const org = await prisma.organization.findUnique({ where: { id: orgId }, select: { name: true } })
  if (!org) return NextResponse.json({ error: 'org_not_found' }, { status: 404 })

  const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
  await prisma.orgInvite.create({
    data: { orgId, email: inviteEmail, role: inviteRole as 'admin' | 'member', expires },
  })

  const baseUrl = process.env.NEXTAUTH_URL ?? 'https://scorestack.io'
  const signInUrl = `${baseUrl}/auth/signin?callbackUrl=${encodeURIComponent('/runs')}`
  await sendOrgInvite(inviteEmail, org.name, signInUrl)

  return NextResponse.json({ invited: true })
}
