import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/app/lib/auth'
import prisma from '@/app/lib/prisma'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> },
) {
  const session = await auth()
  if (!session?.user?.orgId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { jobId } = await params

  const job = await prisma.deliveryJob.findUnique({
    where: { id: jobId },
    select: { orgId: true },
  })

  if (!job || job.orgId !== session.user.orgId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const messages = await prisma.generatedMessage.findMany({
    where: { deliveryJobId: jobId },
    select: {
      id: true,
      body: true,
      editedBody: true,
      deliveryStatus: true,
      sentAt: true,
      runResult: {
        select: { linkedinUrl: true, rowIndex: true },
      },
    },
    orderBy: { runResult: { rowIndex: 'asc' } },
  })

  return NextResponse.json({ messages })
}
