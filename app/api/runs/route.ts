import { NextResponse } from 'next/server'
import { auth } from '@/app/lib/auth'
import prisma from '@/app/lib/prisma'

export async function GET() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const orgId = session.user?.orgId
  if (!orgId) return NextResponse.json({ runs: [] })

  const runs = await prisma.run.findMany({
    where: { orgId },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      originalFilename: true,
      status: true,
      totalContacts: true,
      enrichedCount: true,
      failedCount: true,
      createdAt: true,
      completedAt: true,
      model: { select: { name: true } },
    },
  })

  return NextResponse.json({ runs })
}
