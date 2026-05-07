import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/app/lib/auth'
import prisma from '@/app/lib/prisma'
import { sendMessage } from '@/app/lib/connectsafely'

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ jobId: string; messageId: string }> },
) {
  const session = await auth()
  if (!session?.user?.orgId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.user.plan !== 'pro' && session.user.plan !== 'enterprise') {
    return NextResponse.json({ error: 'Pro plan required' }, { status: 403 })
  }

  const { jobId, messageId } = await params

  const job = await prisma.deliveryJob.findUnique({
    where: { id: jobId },
    select: { orgId: true },
  })
  if (!job || job.orgId !== session.user.orgId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const message = await prisma.generatedMessage.findUnique({
    where: { id: messageId, deliveryJobId: jobId },
    include: { runResult: { select: { linkedinUrl: true } } },
  })
  if (!message) return NextResponse.json({ error: 'Message not found' }, { status: 404 })
  if (message.deliveryStatus !== 'failed') {
    return NextResponse.json({ error: 'Only failed messages can be retried' }, { status: 409 })
  }

  const result = await sendMessage(message.runResult.linkedinUrl, message.editedBody ?? message.body)

  if (result.success) {
    const sentAt = new Date()
    await prisma.$transaction([
      prisma.generatedMessage.update({
        where: { id: messageId },
        data: { deliveryStatus: 'sent', sentAt },
      }),
      prisma.deliveryJob.update({
        where: { id: jobId },
        data: { sentCount: { increment: 1 }, failedCount: { decrement: 1 } },
      }),
    ])
    return NextResponse.json({ success: true, sentAt: sentAt.toISOString() })
  }

  return NextResponse.json({ success: false, error: result.error })
}
