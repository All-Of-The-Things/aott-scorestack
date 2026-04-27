import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/app/lib/auth'
import prisma from '@/app/lib/prisma'
import { generateMessages } from '@/app/lib/messages'

const STARTER_CAP = 100

const bodySchema = z.object({
  run_id: z.string(),
  template_id: z.string(),
  top_n: z.number().int().positive().optional(),
  contact_ids: z.array(z.string()).optional(),
})

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
  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request', issues: parsed.error.issues }, { status: 400 })
  }

  const { run_id, template_id, contact_ids } = parsed.data
  let { top_n } = parsed.data

  const run = await prisma.run.findUnique({
    where: { id: run_id },
    select: { orgId: true },
  })
  if (!run || run.orgId !== orgId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  // Apply Starter cap
  if (plan === 'starter') {
    top_n = Math.min(top_n ?? STARTER_CAP, STARTER_CAP)
  }

  // Resolve contactIds from top_n if provided and no explicit list
  let contactIds = contact_ids
  if (!contactIds && top_n !== undefined) {
    const topResults = await prisma.runResult.findMany({
      where: { runId: run_id, enrichmentStatus: 'success' },
      orderBy: [{ totalScore: 'desc' }, { rowIndex: 'asc' }],
      take: top_n,
      select: { id: true },
    })
    contactIds = topResults.map((r) => r.id)
  }

  const { generated, failed } = await generateMessages(run_id, template_id, contactIds)

  const messages = await prisma.generatedMessage.findMany({
    where: {
      templateId: template_id,
      runResult: { runId: run_id },
    },
    include: {
      runResult: {
        select: { id: true, linkedinUrl: true, totalScore: true, rowIndex: true },
      },
    },
    orderBy: { runResult: { totalScore: 'desc' } },
  })

  return NextResponse.json({ generated, failed, messages })
}
