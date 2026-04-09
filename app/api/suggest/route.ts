import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { EnrichmentStatus } from '@/app/generated/prisma/client'
import prisma from '@/app/lib/prisma'
import { suggestCriteria, type EnrichedSample } from '@/app/lib/suggestions'

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const SuggestBodySchema = z.object({
  run_id: z.string().uuid(),
})

// ---------------------------------------------------------------------------
// POST /api/suggest
//
// Accepts: { run_id: string }
//
// Steps:
//   1. Validate run_id — must be a UUID referencing an existing run
//   2. Load the first 5–10 run_results rows where enrichment_status = 'success'
//   3. Call suggestCriteria(enrichedSample) from lib/suggestions.ts
//      → this calls the Anthropic API and returns a Criterion[] array
//   4. Write the result to runs.ai_suggested_criteria for audit trail
//      (null means suggestions were never requested; this marks the run as having used AI assist)
//   5. Return the criteria array to the client to pre-populate the CriteriaBuilder UI
//
// The user can accept, modify, or entirely ignore the suggestions.
// This route is NOT on the critical enrichment path — it is called on demand
// when the user clicks "Suggest criteria for me" in the CriteriaBuilder.
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  let body: z.infer<typeof SuggestBodySchema>
  try {
    const raw = await request.json()
    body = SuggestBodySchema.parse(raw)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Invalid request body'
    return NextResponse.json({ error: message }, { status: 400 })
  }

  const { run_id } = body

  // Verify run exists
  const run = await prisma.run.findUnique({ where: { id: run_id } })
  if (!run) {
    return NextResponse.json({ error: `Run not found: ${run_id}` }, { status: 404 })
  }

  // Load enriched sample (max 10 successfully enriched contacts)
  const sampleRows = await prisma.runResult.findMany({
    where: {
      runId: run_id,
      enrichmentStatus: EnrichmentStatus.success,
      enrichedData: { not: undefined },
    },
    orderBy: { rowIndex: 'asc' },
    take: 10,
  })

  if (sampleRows.length === 0) {
    return NextResponse.json(
      { error: 'No successfully enriched contacts found for this run' },
      { status: 422 }
    )
  }

  const enrichedSample: EnrichedSample[] = sampleRows.map((row) => ({
    linkedin_url: row.linkedinUrl,
    enriched_data: (row.enrichedData as Record<string, unknown>) ?? null,
  }))

  // Call Anthropic API
  let criteria: Awaited<ReturnType<typeof suggestCriteria>>
  try {
    criteria = await suggestCriteria(enrichedSample)
  } catch (err) {
    console.error('[suggest] suggestCriteria failed:', err)
    return NextResponse.json(
      { error: 'Unable to generate suggestions right now. Please try again later.' },
      { status: 500 },
    )
  }

  // Persist to runs.ai_suggested_criteria for audit trail
  await prisma.run.update({
    where: { id: run_id },
    data: { aiSuggestedCriteria: criteria as object },
  })

  return NextResponse.json({ criteria }, { status: 200 })
}
