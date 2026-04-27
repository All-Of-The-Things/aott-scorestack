import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/app/lib/auth'
import prisma from '@/app/lib/prisma'
import { DEFAULT_SYSTEM_PROMPT } from '@/app/lib/messages'

const createSchema = z.object({
  name: z.string().min(1).max(100),
  tone: z.enum(['Professional', 'Friendly', 'Direct', 'Consultative']),
  goal: z.string().min(1).max(200),
  systemPrompt: z.string().optional(),
})

export async function GET() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const orgId = session.user?.orgId
  if (!orgId) return NextResponse.json({ templates: [] })

  const templates = await prisma.messageTemplate.findMany({
    where: { orgId },
    orderBy: { createdAt: 'asc' },
  })

  return NextResponse.json({ templates })
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const plan = (session.user?.plan ?? 'free') as string
  if (plan === 'free') {
    return NextResponse.json({ error: 'plan_required', requiredPlan: 'starter' }, { status: 403 })
  }

  const orgId = session.user?.orgId
  if (!orgId) return NextResponse.json({ error: 'No organization found' }, { status: 503 })

  const body = await req.json()
  const parsed = createSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request', issues: parsed.error.issues }, { status: 400 })
  }

  const { name, tone, goal } = parsed.data
  // Pro users can supply a custom system prompt; Starter gets the default
  const systemPrompt = plan === 'pro' || plan === 'enterprise'
    ? (parsed.data.systemPrompt ?? DEFAULT_SYSTEM_PROMPT)
    : DEFAULT_SYSTEM_PROMPT

  const template = await prisma.messageTemplate.create({
    data: { orgId, name, tone, goal, systemPrompt },
  })

  return NextResponse.json({ template }, { status: 201 })
}
