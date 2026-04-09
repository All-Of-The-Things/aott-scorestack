import { notFound } from 'next/navigation'
import Link from 'next/link'
import prisma from '@/app/lib/prisma'
import CriteriaBuilder from '@/app/components/CriteriaBuilder'

// ---------------------------------------------------------------------------
// Scoreable fields returned by LinkedAPI / lib/linkedapi.ts
// ---------------------------------------------------------------------------
const SCOREABLE_FIELDS: Record<string, string> = {
  current_title: 'Current Title',
  seniority: 'Seniority',
  company_name: 'Company',
  industry: 'Industry',
  company_size: 'Company Size',
  location: 'Location',
}

function deriveAvailableFields(enrichedRows: { enrichedData: unknown }[]): string[] {
  const found = new Set<string>()
  for (const row of enrichedRows) {
    if (row.enrichedData && typeof row.enrichedData === 'object') {
      for (const key of Object.keys(row.enrichedData as object)) {
        if (key in SCOREABLE_FIELDS) found.add(key)
      }
    }
  }
  return Object.keys(SCOREABLE_FIELDS).filter((k) => found.has(k))
}

// ---------------------------------------------------------------------------
// ScorePage — async Server Component
//
// Phase 4 replaces the placeholder div from Phase 3 with <CriteriaBuilder />.
// The server component derives which fields are available, then passes them
// to the client component so it can render field selectors without an API call.
// ---------------------------------------------------------------------------

interface ScorePageProps {
  params: { runId: string }
}

export default async function ScorePage({ params }: ScorePageProps) {
  const { runId } = params

  const run = await prisma.run.findUnique({ where: { id: runId } })
  if (!run) notFound()

  const enrichedRows = await prisma.runResult.findMany({
    where: { runId, enrichmentStatus: 'success' },
    select: { enrichedData: true },
    take: 20,
    orderBy: { rowIndex: 'asc' },
  })

  const availableFields = deriveAvailableFields(enrichedRows)

  const enrichRate =
    run.totalContacts > 0
      ? Math.round((run.enrichedCount / run.totalContacts) * 100)
      : 0

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="max-w-3xl mx-auto px-4 py-12">

        {/* Back link */}
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-600 transition-colors mb-8"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
          </svg>
          Start over
        </Link>

        {/* Run summary card */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden mb-6">
          <div className="px-6 py-5 border-b border-gray-100">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h1 className="text-base font-semibold text-gray-900">
                  {run.originalFilename}
                </h1>
                <p className="mt-0.5 text-xs text-gray-400">Run ID: {run.id}</p>
              </div>
              <span className="shrink-0 inline-flex items-center gap-1.5 text-xs font-medium text-blue-700 bg-blue-50 border border-blue-100 px-2.5 py-1 rounded-full">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
                Ready to score
              </span>
            </div>
          </div>

          {/* Stats row */}
          <div className="px-6 py-4 grid grid-cols-3 divide-x divide-gray-100">
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
            <div className="pl-6">
              <p className="text-xs text-gray-400">Failed</p>
              <p className={`mt-0.5 text-xl font-bold tabular-nums ${run.failedCount > 0 ? 'text-red-500' : 'text-gray-300'}`}>
                {run.failedCount}
              </p>
            </div>
          </div>
        </div>

        {/* Available fields */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 mb-6">
          <h2 className="text-sm font-semibold text-gray-800 mb-1">
            Available scoring fields
          </h2>
          <p className="text-xs text-gray-400 mb-4">
            These fields were found in the enriched data and can be used as scoring criteria.
          </p>

          {availableFields.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {availableFields.map((field) => (
                <span
                  key={field}
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-700 bg-gray-100 px-3 py-1.5 rounded-lg"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-400 shrink-0" />
                  {SCOREABLE_FIELDS[field]}
                  <span className="text-gray-400 font-mono text-[10px]">{field}</span>
                </span>
              ))}
            </div>
          ) : (
            <p className="text-xs text-amber-600 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
              No scoreable fields found — all contacts may have failed enrichment.
            </p>
          )}
        </div>

        {/* Phase 4: CriteriaBuilder */}
        <CriteriaBuilder runId={runId} availableFields={availableFields} />

      </div>
    </main>
  )
}
