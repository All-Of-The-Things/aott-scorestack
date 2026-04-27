import { notFound } from 'next/navigation'
import prisma from '@/app/lib/prisma'
import { auth } from '@/app/lib/auth'
import { RunStatus } from '@/app/generated/prisma'
import ResultsTable, { type SerializedResult, type CriterionMeta } from '@/app/components/ResultsTable'
import type { CriterionScore, Criterion } from '@/app/lib/scoring'
import SaveModelButton from '@/app/components/SaveModelButton'
import ExportButton from '@/app/components/ExportButton'
import ActivationBanner from '@/app/components/ActivationBanner'
import AppHeader from '@/app/components/AppHeader'
import WorkflowStepper from '@/app/components/WorkflowStepper'

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
  if (Array.isArray(scoringCriteria) && scoringCriteria.length > 0) {
    return (scoringCriteria as Criterion[]).map((c) => ({
      field: c.field,
      weight: c.weight,
    }))
  }
  return []
}

const ACTIVATION_WINDOW_MS = 10 * 60 * 1000

interface ResultsPageProps {
  params: { runId: string }
}

export default async function ResultsPage({ params }: ResultsPageProps) {
  const { runId } = params

  const [run, session] = await Promise.all([
    prisma.run.findUnique({
      where: { id: runId },
      include: { model: { select: { name: true } } },
    }),
    auth(),
  ])
  if (!run) notFound()

  if (!session) {
    const signInUrl = `/auth/signin?callbackUrl=/run/${runId}/results`
    return (
      <>
        <AppHeader userEmail={null} />
        <main className="bg-gray-50">
          <div className="flex items-center justify-center px-4 py-24">
            <div className="w-full max-w-sm bg-white rounded-2xl shadow-sm border border-gray-200 p-8 text-center">
              <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-5 h-5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
                </svg>
              </div>
              <h2 className="text-base font-semibold text-gray-900 mb-1">Sign in to view results</h2>
              <p className="text-sm text-gray-500 mb-6">
                Scored contact lists are private. Sign in to access your ranked results and save scoring models.
              </p>
              <a
                href={signInUrl}
                className="inline-flex items-center justify-center w-full px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
              >
                Sign in →
              </a>
              <p className="mt-4 text-xs text-gray-400">
                No account yet? Signing in creates one automatically.
              </p>
            </div>
          </div>
        </main>
      </>
    )
  }

  if (run.status !== RunStatus.complete) {
    return (
      <>
        <AppHeader userEmail={session.user.email} plan={session.user.plan} />
        <main className="bg-gray-50">
          <div className="flex items-center justify-center px-4 py-24 text-center">
            <div>
              <div className="w-8 h-8 border-2 border-gray-300 border-t-gray-700 rounded-full animate-spin mx-auto mb-4" />
              <p className="text-sm font-medium text-gray-700">Scoring in progress...</p>
              <p className="mt-1 text-xs text-gray-400">
                This page will show results once scoring completes.
              </p>
            </div>
          </div>
        </main>
      </>
    )
  }

  const [runResults, dbUser] = await Promise.all([
    prisma.runResult.findMany({
      where: { runId },
      orderBy: [{ totalScore: 'desc' }, { rowIndex: 'asc' }],
    }),
    prisma.user.findUnique({
      where: { id: session.user.id },
      select: { emailVerified: true },
    }),
  ])

  // Show the activation banner if the user verified their email within the last 10 minutes.
  const justActivated =
    !!dbUser?.emailVerified &&
    Date.now() - dbUser.emailVerified.getTime() < ACTIVATION_WINDOW_MS

  const scoringCriteria = run.scoringCriteria
  const criteria = deriveCriteria(runResults, scoringCriteria)

  const serialized: SerializedResult[] = runResults.map((r, i) => ({
    id: r.id,
    rank: i + 1,
    linkedinUrl: r.linkedinUrl,
    enrichmentStatus: r.enrichmentStatus as SerializedResult['enrichmentStatus'],
    totalScore: Number(r.totalScore ?? 0),
    criterionScores: (r.criterionScores as unknown as CriterionScore[]) ?? [],
  }))

  const plan   = session.user?.plan ?? 'free'
  const isFree = !run.orgId || plan === 'free'
  const defaultPageSize = Math.max(1, parseInt(process.env.RESULTS_PAGE_SIZE ?? '25', 10))

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
    <>
      <AppHeader
        userEmail={session.user.email}
        plan={session.user.plan}
        breadcrumb={[
          { label: run.originalFilename, href: `/run/${runId}/score` },
          { label: 'Results' },
        ]}
        modelName={run.model?.name ?? null}
      />

      <main className="bg-gray-50">
        <div className="max-w-5xl mx-auto px-4 pt-8 pb-16">

          {justActivated && <ActivationBanner />}

          <WorkflowStepper currentStep={3} runId={runId} />

          <h1 className="text-xl font-semibold text-gray-900 mb-6">Scored results</h1>

          {/* Context cards: side-by-side */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">

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
                  {completedAt && (
                    <p className="text-[11px] text-gray-400">Completed {completedAt}</p>
                  )}
                </div>
                <span className="shrink-0 inline-flex items-center gap-1 text-[11px] font-medium text-green-700 bg-green-50 border border-green-100 px-2 py-0.5 rounded-full">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                  Complete
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

            {/* Criteria used */}
            {usedCriteria.length > 0 && (
              <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-5">
                <h2 className="text-xs font-semibold text-gray-700 mb-3">Scoring criteria used</h2>
                <div className="space-y-2">
                  {usedCriteria.map((c, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs">
                      <span className="font-medium text-gray-700 w-24 shrink-0 truncate">
                        {FIELD_LABELS[c.field] ?? c.field}
                      </span>
                      <span className="text-gray-400">
                        {MATCH_TYPE_LABELS[c.match_type] ?? c.match_type}:
                      </span>
                      <span className="text-gray-600 flex-1 truncate">
                        {c.match_values.join(', ')}
                      </span>
                      <span className="shrink-0 text-[10px] font-medium text-gray-500 bg-gray-100 border border-gray-200 px-2 py-0.5 rounded-full">
                        {c.weight}%
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Actions row: save model + export */}
          <div className="flex items-start justify-between gap-3 mb-3">
            <ExportButton runId={runId} isFree={isFree} />
            <SaveModelButton
              criteria={usedCriteria}
              savedModelName={run.model?.name ?? null}
              knownEmail={run.notifyEmail ?? undefined}
            />
          </div>

          <ResultsTable results={serialized} criteria={criteria} defaultPageSize={defaultPageSize} />

        </div>
      </main>
    </>
  )
}
