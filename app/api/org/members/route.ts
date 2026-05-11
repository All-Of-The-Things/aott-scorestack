import { NextResponse } from 'next/server'
import { auth } from '@/app/lib/auth'
import prisma from '@/app/lib/prisma'

export async function GET() {
  if (process.env.TEAMS_ENABLED !== 'true') {
    return NextResponse.json({ error: 'feature_disabled' }, { status: 404 })
  }

  const session = await auth()
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { orgId } = session.user
  if (!orgId) return NextResponse.json({ error: 'account_setup_incomplete' }, { status: 503 })

  const members = await prisma.user.findMany({
    where: { orgId },
    select: { id: true, email: true, name: true, role: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  })

  return NextResponse.json({ members })
}
