import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import prisma from '@/app/lib/prisma'
import { auth } from '@/app/lib/auth'
import type { Criterion } from '@/app/lib/scoring'

// -1 means unlimited
const PLAN_MODEL_LIMITS: Record<string, number> = {
  free: 1,
  starter: 5,
  pro: -1,
  enterprise: -1,
}

// ---------------------------------------------------------------------------
// Shared validation
// ---------------------------------------------------------------------------

const CriterionSchema = z.object({
  field: z.string().min(1),
  match_type: z.enum(['exact', 'list', 'range']),
  match_values: z.array(z.string()),
  score_if_match: z.number().min(0).max(100),
  score_if_no_match: z.number().min(0).max(100),
  weight: z.number().min(0).max(100),
})

const CreateModelSchema = z.object({
  name: z.string().min(1).max(100),
  criteria: z.array(CriterionSchema).min(1),
})

// ---------------------------------------------------------------------------
// GET /api/models
//
// Returns the list of all saved scoring models, ordered by created_at DESC.
// Each entry includes a criteria summary (field names + weights) for display
// in the home page "re-run a saved model" section — without returning the full
// criteria JSONB to keep the response lightweight.
// ---------------------------------------------------------------------------

export async function GET() {
  const session = await auth()
  const userId = session?.user?.id ?? null

  if (!userId) {
    return NextResponse.json({ models: [] }, { status: 200 })
  }

  const models = await prisma.scoringModel.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      name: true,
      createdAt: true,
      criteria: true,
    },
  })

  const response = models.map((m) => {
    const criteria = m.criteria as unknown as Criterion[]
    return {
      id: m.id,
      name: m.name,
      created_at: m.createdAt.toISOString(),
      criteria_summary: criteria.map((c) => ({
        field: c.field,
        weight: c.weight,
      })),
      criteria_count: criteria.length,
    }
  })

  return NextResponse.json({ models: response }, { status: 200 })
}

// ---------------------------------------------------------------------------
// POST /api/models
//
// Saves a scoring model (name + criteria array) to the scoring_models table.
// Called from the "Save Model" modal on the results page.
//
// Accepts: { name: string, criteria: Criterion[] }
// Returns: { model_id: string }
//
// The saved model can later be passed as model_id to POST /api/score
// to re-run scoring on a new CSV without reconfiguring criteria.
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  let body: z.infer<typeof CreateModelSchema>
  try {
    const raw = await request.json()
    body = CreateModelSchema.parse(raw)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Invalid request body'
    return NextResponse.json({ error: message }, { status: 400 })
  }

  const { name, criteria } = body

  // Validate weights sum to 100
  const totalWeight = criteria.reduce((sum, c) => sum + c.weight, 0)
  if (Math.abs(totalWeight - 100) > 0.01) {
    return NextResponse.json(
      { error: `Criteria weights must sum to 100. Current total: ${totalWeight}` },
      { status: 422 }
    )
  }

  // Enforce per-plan model limit (scoped to the current user)
  const session = await auth()
  const userId = session?.user?.id ?? null

  if (userId) {
    // Determine plan: look up org if present, otherwise default to free
    const orgId = session?.user?.orgId ?? null
    let plan = 'free'
    if (orgId) {
      const org = await prisma.organization.findUnique({
        where: { id: orgId },
        select: { plan: true },
      })
      plan = org?.plan ?? 'free'
    }

    const limit = PLAN_MODEL_LIMITS[plan] ?? 1
    if (limit !== -1) {
      const count = await prisma.scoringModel.count({ where: { userId } })
      if (count >= limit) {
        return NextResponse.json(
          { error: 'model_limit_reached', limit, plan },
          { status: 409 }
        )
      }
    }
  }

  const model = await prisma.scoringModel.create({
    data: {
      name,
      criteria: criteria as object,
      ...(userId ? { userId } : {}),
    },
  })

  return NextResponse.json({ model_id: model.id }, { status: 201 })
}
