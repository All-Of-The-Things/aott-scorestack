import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import prisma from '@/app/lib/prisma'
import { EnrichmentStatus, RunStatus } from '@/app/generated/prisma'
import { computeScores, type Criterion } from '@/app/lib/scoring'

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const CriterionSchema = z.object({
  field: z.string().min(1),
  match_type: z.enum(['exact', 'list', 'range']),
  match_values: z.array(z.string()),
  score_if_match: z.number().min(0).max(100),
  score_if_no_match: z.number().min(0).max(100),
  weight: z.number().min(0).max(100),
})

// Two valid request shapes:
//   1. run_id + criteria array (new run from CriteriaBuilder)
//   2. run_id + model_id (re-run using a saved model)
const ScoreBodySchema = z
  .object({
    run_id: z.string().uuid(),
    criteria: z.array(CriterionSchema).optional(),
    model_id: z.string().uuid().optional(),
  })
  .refine((data) => data.criteria !== undefined || data.model_id !== undefined, {
    message: 'Either criteria or model_id must be provided',
  })

// ---------------------------------------------------------------------------
// POST /api/score
//
// Accepts:
//   { run_id, criteria: Criterion[] }       — score with user-provided criteria
//   { run_id, model_id: string }            — re-run using a saved scoring model
//
// Steps:
//   1. Validate request body
//   2. Resolve criteria: use provided array, or load from scoring_models if model_id given
//   3. Validate criteria weights sum to 100 (±0.01 tolerance for floating-point)
//   4. Load all run_results rows for run_id
//   5. For each contact: call computeScores(enrichedData, criteria) from lib/scoring.ts
//      - enrichment_status = 'failed' → total_score = 0, criterion_scores = []
//   6. Bulk UPDATE run_results with total_score + criterion_scores
//   7. UPDATE runs.status → 'complete', runs.completed_at, runs.model_id (if re-run)
//   8. Return contacts sorted by total_score DESC, ties broken by row_index ASC
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  let body: z.infer<typeof ScoreBodySchema>
  try {
    const raw = await request.json()
    body = ScoreBodySchema.parse(raw)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Invalid request body'
    return NextResponse.json({ error: message }, { status: 400 })
  }

  const { run_id, model_id } = body
  let criteria: Criterion[]

  // Resolve criteria source
  if (body.criteria) {
    criteria = body.criteria as Criterion[]
  } else {
    // Load from saved model
    const model = await prisma.scoringModel.findUnique({ where: { id: model_id! } })
    if (!model) {
      return NextResponse.json({ error: `Scoring model not found: ${model_id}` }, { status: 404 })
    }
    criteria = model.criteria as unknown as Criterion[]
  }

  // Validate weights sum to 100
  const totalWeight = criteria.reduce((sum, c) => sum + c.weight, 0)
  if (Math.abs(totalWeight - 100) > 0.01) {
    return NextResponse.json(
      { error: `Criteria weights must sum to 100. Current total: ${totalWeight}` },
      { status: 422 }
    )
  }

  // Verify run exists
  const run = await prisma.run.findUnique({ where: { id: run_id } })
  if (!run) {
    return NextResponse.json({ error: `Run not found: ${run_id}` }, { status: 404 })
  }

  // Load all run_results
  const runResults = await prisma.runResult.findMany({
    where: { runId: run_id },
    orderBy: { rowIndex: 'asc' },
  })

  if (runResults.length === 0) {
    return NextResponse.json({ error: 'No contacts found for this run' }, { status: 422 })
  }

  // Score each contact
  const updates: Promise<unknown>[] = []
  const scored = runResults.map((result) => {
    const isEnriched = result.enrichmentStatus === EnrichmentStatus.success && result.enrichedData !== null

    const { total_score, criterion_scores } = isEnriched
      ? computeScores(result.enrichedData as Record<string, unknown>, criteria)
      : { total_score: 0, criterion_scores: [] }

    updates.push(
      prisma.runResult.update({
        where: { id: result.id },
        data: {
          totalScore: total_score,
          criterionScores: criterion_scores as object,
        },
      })
    )

    return {
      id: result.id,
      row_index: result.rowIndex,
      linkedin_url: result.linkedinUrl,
      enrichment_status: result.enrichmentStatus,
      enriched_data: result.enrichedData,
      total_score,
      criterion_scores,
    }
  })

  // Persist all score updates in parallel
  await Promise.all(updates)

  // Finalize run
  await prisma.run.update({
    where: { id: run_id },
    data: {
      status: RunStatus.complete,
      completedAt: new Date(),
      // Persist the criteria used so the results page can display them
      ...(body.criteria ? { scoringCriteria: criteria as object } : {}),
      ...(model_id ? { modelId: model_id } : {}),
    },
  })

  // Sort: total_score DESC, row_index ASC for ties
  const sorted = scored.sort((a, b) => {
    if (b.total_score !== a.total_score) return b.total_score - a.total_score
    return a.row_index - b.row_index
  })

  return NextResponse.json(
    {
      run_id,
      total_contacts: sorted.length,
      results: sorted,
    },
    { status: 200 }
  )
}
