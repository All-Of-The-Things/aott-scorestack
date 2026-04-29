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
    include: { run: { select: { name: true, originalFilename: true } } },
  })

  if (!job || job.orgId !== session.user.orgId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  return NextResponse.json({ job })
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> },
) {
  const session = await auth()
  if (!session?.user?.orgId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { jobId } = await params

  const job = await prisma.deliveryJob.findUnique({ where: { id: jobId } })

  if (!job || job.orgId !== session.user.orgId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  if (job.status !== 'scheduled') {
    return NextResponse.json({ error: 'Only scheduled jobs can be cancelled' }, { status: 409 })
  }

  await prisma.$transaction([
    prisma.generatedMessage.updateMany({
      where: { deliveryJobId: jobId },
      data: { deliveryJobId: null, deliveryStatus: 'pending' },
    }),
    prisma.deliveryJob.update({
      where: { id: jobId },
      data: { status: 'cancelled' },
    }),
  ])

  return NextResponse.json({ cancelled: true })
}
