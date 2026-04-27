import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/app/lib/auth'
import prisma from '@/app/lib/prisma'
import { DEFAULT_SYSTEM_PROMPT } from '@/app/lib/messages'

const updateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  tone: z.enum(['Professional', 'Friendly', 'Direct', 'Consultative']).optional(),
  goal: z.string().min(1).max(200).optional(),
  systemPrompt: z.string().optional(),
})

export async function PUT(
  req: NextRequest,
  { params }: { params: { templateId: string } }
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const orgId = session.user?.orgId
  if (!orgId) return NextResponse.json({ error: 'No organization found' }, { status: 503 })

  const template = await prisma.messageTemplate.findUnique({
    where: { id: params.templateId },
  })
  if (!template || template.orgId !== orgId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const body = await req.json()
  const parsed = updateSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request', issues: parsed.error.issues }, { status: 400 })
  }

  const plan = (session.user?.plan ?? 'free') as string
  const canCustomizePrompt = plan === 'pro' || plan === 'enterprise'

  const updated = await prisma.messageTemplate.update({
    where: { id: params.templateId },
    data: {
      ...parsed.data,
      // Only Pro+ can change the system prompt
      systemPrompt: canCustomizePrompt
        ? (parsed.data.systemPrompt ?? template.systemPrompt)
        : DEFAULT_SYSTEM_PROMPT,
    },
  })

  return NextResponse.json({ template: updated })
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { templateId: string } }
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const orgId = session.user?.orgId
  if (!orgId) return NextResponse.json({ error: 'No organization found' }, { status: 503 })

  const template = await prisma.messageTemplate.findUnique({
    where: { id: params.templateId },
  })
  if (!template || template.orgId !== orgId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  await prisma.messageTemplate.delete({ where: { id: params.templateId } })

  return new NextResponse(null, { status: 204 })
}
