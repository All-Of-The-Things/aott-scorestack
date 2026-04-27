import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import prisma from '@/app/lib/prisma'
import { auth } from '@/app/lib/auth'
import CriteriaBuilder from '@/app/components/CriteriaBuilder'
import AppHeader from '@/app/components/AppHeader'
import WorkflowStepper from '@/app/components/WorkflowStepper'
import EnrichingWait from '@/app/components/EnrichingWait'
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

  if (run.status === 'enriching') {
    return (
      <>
        <AppHeader
          userEmail={session.user.email}
          plan={session.user.plan}
          breadcrumb={[{ label: run.originalFilename, href: '/enrich' }, { label: 'Define criteria' }]}
        />
        <main className="bg-gray-50">
          <div className="max-w-5xl mx-auto px-4 pt-8 pb-16">
            <WorkflowStepper currentStep={2} runId={runId} />
            <EnrichingWait runId={runId} />
          </div>
        </main>
      </>
    )
  }

  if (run.status === 'failed') {
    return (
      <>
        <AppHeader
          userEmail={session.user.email}
          plan={session.user.plan}
          breadcrumb={[{ label: run.originalFilename, href: '/enrich' }, { label: 'Define criteria' }]}
        />
        <main className="bg-gray-50">
          <div className="max-w-5xl mx-auto px-4 pt-8 pb-16">
            <WorkflowStepper currentStep={2} runId={runId} />
            <div className="min-h-[60vh] flex items-center justify-center">
              <div className="bg-white rounded-2xl shadow-sm border border-red-200 p-10 max-w-sm w-full text-center">
                <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center mx-auto">
                  <svg className="w-5 h-5 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                  </svg>
                </div>
                <h2 className="mt-4 text-sm font-semibold text-gray-800">Enrichment failed</h2>
                <p className="mt-1.5 text-xs text-gray-500">Something went wrong while processing your contacts.</p>
                <Link href="/enrich" className="mt-5 inline-block text-xs text-blue-600 hover:underline font-medium">
                  ← Start over
                </Link>
              </div>
            </div>
          </div>
        </main>
      </>
    )
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

  const wasCapped =
    run.originalTotalContacts !== null &&
    run.originalTotalContacts > run.totalContacts

  return (
    <>
      <AppHeader
        userEmail={session.user.email}
        plan={session.user.plan}
        breadcrumb={[
          { label: run.originalFilename, href: '/enrich' },
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

              {/* Free plan cap notice */}
              {wasCapped && (
                <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-xl">
                  <svg className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                  </svg>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-amber-800">Free plan limit reached</p>
                    <p className="text-xs text-amber-700 mt-0.5">
                      Your CSV had {run.originalTotalContacts} contacts. Only the first {run.totalContacts} were enriched.{' '}
                      <Link href="/settings/billing" className="underline font-medium hover:text-amber-900 transition-colors">
                        Upgrade for unlimited
                      </Link>
                    </p>
                  </div>
                </div>
              )}

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
