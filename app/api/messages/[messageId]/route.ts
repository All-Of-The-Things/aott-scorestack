import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/app/lib/auth'
import prisma from '@/app/lib/prisma'

const patchSchema = z.object({
  editedBody: z.string().min(1).max(1000),
})

export async function PATCH(
  req: NextRequest,
  { params }: { params: { messageId: string } }
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const orgId = session.user?.orgId
  if (!orgId) return NextResponse.json({ error: 'No organization found' }, { status: 503 })

  const message = await prisma.generatedMessage.findUnique({
    where: { id: params.messageId },
    include: { runResult: { include: { run: { select: { orgId: true } } } } },
  })
  if (!message || message.runResult.run.orgId !== orgId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const body = await req.json()
  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request', issues: parsed.error.issues }, { status: 400 })
  }

  const updated = await prisma.generatedMessage.update({
    where: { id: params.messageId },
    data: { editedBody: parsed.data.editedBody },
  })

  return NextResponse.json({ message: updated })
}
