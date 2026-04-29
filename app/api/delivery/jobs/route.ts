import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/app/lib/auth'
import prisma from '@/app/lib/prisma'
import { processDeliveryJob } from '@/app/lib/delivery'

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.orgId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.user.plan !== 'pro' && session.user.plan !== 'enterprise') {
    return NextResponse.json({ error: 'Pro plan required' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const runId = searchParams.get('runId')

  const jobs = await prisma.deliveryJob.findMany({
    where: {
      orgId: session.user.orgId,
      ...(runId ? { runId } : {}),
    },
    include: {
      run: { select: { name: true, originalFilename: true } },
    },
    orderBy: { createdAt: 'desc' },
  })

  return NextResponse.json({ jobs })
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.orgId || !session.user.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (session.user.plan !== 'pro' && session.user.plan !== 'enterprise') {
    return NextResponse.json({ error: 'Pro plan required' }, { status: 403 })
  }

  const body = await req.json() as { run_id?: string; contact_ids?: string[] }
  const { run_id, contact_ids } = body

  if (!run_id) return NextResponse.json({ error: 'run_id required' }, { status: 400 })

  const messages = await prisma.generatedMessage.findMany({
    where: {
      runResult: { runId: run_id },
      deliveryStatus: 'pending',
      ...(contact_ids?.length ? { runResultId: { in: contact_ids } } : {}),
    },
    select: { id: true },
  })

  if (messages.length === 0) {
    return NextResponse.json({ error: 'No pending messages found for this run' }, { status: 400 })
  }

  const job = await prisma.deliveryJob.create({
    data: {
      orgId: session.user.orgId,
      runId: run_id,
      status: 'scheduled',
      channel: 'linkedin',
    },
  })

  await prisma.generatedMessage.updateMany({
    where: { id: { in: messages.map((m) => m.id) } },
    data: { deliveryJobId: job.id },
  })

  const notifyEmail = session.user.email
  processDeliveryJob(job.id, notifyEmail).catch(console.error)

  return NextResponse.json({ job })
}
