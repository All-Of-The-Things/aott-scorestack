import { notFound } from 'next/navigation'
import Link from 'next/link'
import prisma from '@/app/lib/prisma'
import { RunStatus } from '@/app/generated/prisma'
import ResultsTable, { type SerializedResult, type CriterionMeta } from '@/app/components/ResultsTable'
import type { CriterionScore, Criterion } from '@/app/lib/scoring'

// ---------------------------------------------------------------------------
// Field display labels — matches the set defined in Phase 3 / CriteriaBuilder
// ---------------------------------------------------------------------------
const FIELD_LABELS: Record<string, string> = {
  current_title: 'Current Title',
  seniority: 'Seniority',
  company_name: 'Company',
  industry: 'Industry',
  company_size: 'Company Size',
  location: 'Location',
}

const MATCH_TYPE_LABELS: Record<string, string> = {
  exact: 'Exact',
  list: 'One of list',
  range: 'Range',
}

// ---------------------------------------------------------------------------
// Derive criteria column headers from the first scored result.
// Falls back to run.scoringCriteria if criterionScores are empty.
// ---------------------------------------------------------------------------
function deriveCriteria(
  results: { criterionScores: unknown }[],
  scoringCriteria: unknown
): CriterionMeta[] {
  for (const result of results) {
    const scores = result.criterionScores
    if (Array.isArray(scores) && scores.length > 0) {
      return (scores as CriterionScore[]).map((cs) => ({
        field: cs.field,
        weight: cs.weight,
      }))
    }
  }
  // Fallback: derive from persisted scoringCriteria
  if (Array.isArray(scoringCriteria) && scoringCriteria.length > 0) {
    return (scoringCriteria as unknown as Criterion[]).map((c) => ({
      field: c.field,
      weight: c.weight,
    }))
  }
  return []
}

// ---------------------------------------------------------------------------
// ResultsPage — async Server Component
//
// Renders at /run/[runId]/results after POST /api/score completes and
// CriteriaBuilder redirects here.
//
// Shows:
//   1. Run summary card — filename, enrichment stats, completion time
//   2. Criteria used card — fields, match types, weights from run.scoringCriteria
//   3. ResultsTable — ranked contacts with score bars and expandable breakdowns
//
// Phase 6 wires up the "Save as model" button — disabled stub here.
// ---------------------------------------------------------------------------

interface ResultsPageProps {
  params: { runId: string }
}

export default async function ResultsPage({ params }: ResultsPageProps) {
  const { runId } = params

  const run = await prisma.run.findUnique({ where: { id: runId } })
  if (!run) notFound()

  // Guard: scoring may still be in progress if the user navigates here early
  if (run.status !== RunStatus.complete) {
    return (
      <main className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-gray-300 border-t-gray-700 rounded-full animate-spin mx-auto mb-4" />
          <p className="text-sm font-medium text-gray-700">Scoring in progress…</p>
          <p className="mt-1 text-xs text-gray-400">
            This page will show results once scoring completes.
          </p>
        </div>
      </main>
    )
  }

  const runResults = await prisma.runResult.findMany({
    where: { runId },
    orderBy: [{ totalScore: 'desc' }, { rowIndex: 'asc' }],
  })

  const scoringCriteria = run.scoringCriteria
  const criteria = deriveCriteria(runResults, scoringCriteria)

  // Serialize Prisma Decimal → plain number; cast JSONB → typed arrays
  const serialized: SerializedResult[] = runResults.map((r, i) => ({
    id: r.id,
    rank: i + 1,
    linkedinUrl: r.linkedinUrl,
    enrichmentStatus: r.enrichmentStatus as SerializedResult['enrichmentStatus'],
    totalScore: Number(r.totalScore ?? 0),
    criterionScores: (r.criterionScores as unknown as CriterionScore[]) ?? [],
  }))

  const enrichRate =
    run.totalContacts > 0
      ? Math.round((run.enrichedCount / run.totalContacts) * 100)
      : 0

  const completedAt = run.completedAt
    ? run.completedAt.toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })
    : null

  const usedCriteria = Array.isArray(scoringCriteria)
    ? (scoringCriteria as unknown as Criterion[])
    : []

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="max-w-3xl mx-auto px-4 py-12">

        {/* Back link */}
        <Link
          href={`/run/${runId}/score`}
          className="inline-flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-600 transition-colors mb-8"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
          </svg>
          Back to scoring
        </Link>

        {/* Run summary card */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden mb-6">
          <div className="px-6 py-5 border-b border-gray-100">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h1 className="text-base font-semibold text-gray-900">
                  {run.originalFilename}
                </h1>
                {completedAt && (
                  <p className="mt-0.5 text-xs text-gray-400">Completed {completedAt}</p>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="inline-flex items-center gap-1.5 text-xs font-medium text-green-700 bg-green-50 border border-green-100 px-2.5 py-1 rounded-full">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                  Complete
                </span>
                {/* Phase 6: Save as model — disabled stub */}
                <button
                  disabled
                  title="Available in Phase 6"
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-500 bg-gray-100 border border-gray-200 px-2.5 py-1 rounded-full opacity-40 cursor-not-allowed"
                >
                  Save as model
                </button>
              </div>
            </div>
          </div>

          {/* Stats row */}
          <div className="px-6 py-4 grid grid-cols-4 divide-x divide-gray-100">
            <div className="pr-6">
              <p className="text-xs text-gray-400">Total contacts</p>
              <p className="mt-0.5 text-xl font-bold text-gray-900 tabular-nums">
                {run.totalContacts}
              </p>
            </div>
            <div className="px-6">
              <p className="text-xs text-gray-400">Enriched</p>
              <p className="mt-0.5 text-xl font-bold text-green-600 tabular-nums">
                {run.enrichedCount}
                <span className="ml-1 text-xs font-medium text-gray-400">({enrichRate}%)</span>
              </p>
            </div>
            <div className="px-6">
              <p className="text-xs text-gray-400">Failed</p>
              <p className={`mt-0.5 text-xl font-bold tabular-nums ${run.failedCount > 0 ? 'text-red-500' : 'text-gray-300'}`}>
                {run.failedCount}
              </p>
            </div>
            <div className="pl-6">
              <p className="text-xs text-gray-400">Avg enrichment</p>
              <p className="mt-0.5 text-xl font-bold text-gray-700 tabular-nums">
                {run.avgEnrichmentMs
                  ? `${(run.avgEnrichmentMs / 1000).toFixed(1)}s`
                  : <span className="text-gray-300">—</span>}
              </p>
            </div>
          </div>
        </div>

        {/* Criteria used card */}
        {usedCriteria.length > 0 && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 mb-6">
            <h2 className="text-sm font-semibold text-gray-800 mb-1">Scoring criteria used</h2>
            <p className="text-xs text-gray-400 mb-4">
              These criteria were applied to rank the contacts below.
            </p>
            <div className="space-y-2">
              {usedCriteria.map((c, i) => (
                <div
                  key={i}
                  className="flex items-center gap-2 text-xs"
                >
                  <span className="font-medium text-gray-700 w-28 shrink-0">
                    {FIELD_LABELS[c.field] ?? c.field}
                  </span>
                  <span className="text-gray-400">
                    {MATCH_TYPE_LABELS[c.match_type] ?? c.match_type}:
                  </span>
                  <span className="text-gray-600 flex-1 truncate">
                    {c.match_values.join(', ')}
                  </span>
                  <span className="shrink-0 text-[10px] font-medium text-gray-500 bg-gray-100 border border-gray-200 px-2 py-0.5 rounded-full">
                    {c.weight}% weight
                  </span>
                  <span className="shrink-0 text-[10px] text-gray-400">
                    ✓ {c.score_if_match} / ✗ {c.score_if_no_match}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Ranked results table */}
        <ResultsTable results={serialized} criteria={criteria} />

      </div>
    </main>
  )
}
