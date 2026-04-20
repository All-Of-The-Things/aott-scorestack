import { notFound, redirect } from 'next/navigation'
import prisma from '@/app/lib/prisma'
import { auth } from '@/app/lib/auth'
import CriteriaBuilder from '@/app/components/CriteriaBuilder'
import AppHeader from '@/app/components/AppHeader'
import WorkflowStepper from '@/app/components/WorkflowStepper'
import type { Criterion } from '@/app/lib/scoring'

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

interface ScorePageProps {
  params: { runId: string }
}

export default async function ScorePage({ params }: ScorePageProps) {
  const { runId } = params

  const [run, session] = await Promise.all([
    prisma.run.findUnique({ where: { id: runId } }),
    auth(),
  ])
  if (!run) notFound()

  if (!session) {
    redirect(`/auth/signin?callbackUrl=/run/${runId}/score`)
  }

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
    <>
      <AppHeader
        userEmail={session.user.email}
        breadcrumb={[
          { label: run.originalFilename, href: '/' },
          { label: 'Define criteria' },
        ]}
      />

      <main className="bg-gray-50">
        <div className="max-w-5xl mx-auto px-4 pt-8 pb-16">

          <WorkflowStepper currentStep={2} runId={runId} />

          <h1 className="text-xl font-semibold text-gray-900 mb-6">
            Define scoring criteria
          </h1>

          <div className="grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-6 items-start">

            {/* Left column: context */}
            <aside className="space-y-4">

              {/* Run summary */}
              <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-100 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <svg className="w-3.5 h-3.5 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                      </svg>
                      <p className="text-xs font-medium text-gray-700 truncate">{run.originalFilename}</p>
                    </div>
                  </div>
                  <span className="shrink-0 inline-flex items-center gap-1 text-[11px] font-medium text-blue-700 bg-blue-50 border border-blue-100 px-2 py-0.5 rounded-full">
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
                    Ready to score
                  </span>
                </div>
                <div className="px-5 py-3 grid grid-cols-3 divide-x divide-gray-100 text-center">
                  <div className="pr-3">
                    <p className="text-[10px] text-gray-400">Total</p>
                    <p className="text-base font-bold text-gray-900 tabular-nums">{run.totalContacts}</p>
                  </div>
                  <div className="px-3">
                    <p className="text-[10px] text-gray-400">Enriched</p>
                    <p className="text-base font-bold text-green-600 tabular-nums">
                      {run.enrichedCount}
                      <span className="ml-0.5 text-[10px] font-medium text-gray-400">({enrichRate}%)</span>
                    </p>
                  </div>
                  <div className="pl-3">
                    <p className="text-[10px] text-gray-400">Failed</p>
                    <p className={`text-base font-bold tabular-nums ${run.failedCount > 0 ? 'text-red-500' : 'text-gray-300'}`}>
                      {run.failedCount}
                    </p>
                  </div>
                </div>
              </div>

              {/* Available fields */}
              <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-5">
                <h2 className="text-xs font-semibold text-gray-700 mb-1">Available fields</h2>
                <p className="text-[11px] text-gray-400 mb-3">
                  Fields found in the enriched data.
                </p>
                {availableFields.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {availableFields.map((field) => (
                      <span
                        key={field}
                        className="inline-flex items-center gap-1 text-[11px] font-medium text-gray-700 bg-gray-100 px-2.5 py-1 rounded-lg"
                      >
                        <span className="w-1.5 h-1.5 rounded-full bg-blue-400 shrink-0" />
                        {SCOREABLE_FIELDS[field]}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-amber-600 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                    No scoreable fields found — all contacts may have failed enrichment.
                  </p>
                )}
              </div>

            </aside>

            {/* Right column: action */}
            <section>
              <CriteriaBuilder
                runId={runId}
                availableFields={availableFields}
                initialCriteria={
                  (run.scoringCriteria as Criterion[] | null)
                  ?? (run.aiSuggestedCriteria as Criterion[] | null)
                  ?? []
                }
              />
            </section>

          </div>
        </div>
      </main>
    </>
  )
}
