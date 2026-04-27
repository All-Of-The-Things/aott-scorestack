import { redirect } from 'next/navigation'
import Link from 'next/link'
import { auth } from '@/app/lib/auth'
import prisma from '@/app/lib/prisma'
import AppHeader from '@/app/components/AppHeader'

const STATUS_CONFIG: Record<string, { label: string; dot: string; text: string }> = {
  complete:  { label: 'Complete',  dot: 'bg-green-500',  text: 'text-green-700 bg-green-50 border-green-100' },
  enriching: { label: 'Enriching', dot: 'bg-blue-400',   text: 'text-blue-700 bg-blue-50 border-blue-100'   },
  scoring:   { label: 'Scoring',   dot: 'bg-blue-400',   text: 'text-blue-700 bg-blue-50 border-blue-100'   },
  pending:   { label: 'Pending',   dot: 'bg-gray-400',   text: 'text-gray-500 bg-gray-100 border-gray-200'  },
  failed:    { label: 'Failed',    dot: 'bg-red-400',    text: 'text-red-600 bg-red-50 border-red-100'      },
}

function formatDate(d: Date) {
  return d.toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })
}

export default async function RunsPage() {
  const session = await auth()
  if (!session) redirect('/auth/signin?callbackUrl=/runs')

  const orgId = session.user?.orgId
  const runs = orgId
    ? await prisma.run.findMany({
        where: { orgId },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          name: true,
          originalFilename: true,
          status: true,
          totalContacts: true,
          enrichedCount: true,
          failedCount: true,
          createdAt: true,
          completedAt: true,
          model: { select: { name: true } },
        },
      })
    : []

  return (
    <>
      <AppHeader
        userEmail={session.user.email}
        plan={session.user.plan}
      />

      <main className="bg-gray-50 min-h-screen">
        <div className="max-w-5xl mx-auto px-4 pt-8 pb-16">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-xl font-semibold text-gray-900">Enrichments</h1>
              <p className="text-xs text-gray-400 mt-0.5">
                {runs.length} enrichment{runs.length !== 1 ? 's' : ''} in your workspace
              </p>
            </div>
            <Link
              href="/enrich"
              className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
              New enrichment
            </Link>
          </div>

          {runs.length === 0 ? (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-16 text-center">
              <div className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3">
                <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                </svg>
              </div>
              <h3 className="text-sm font-semibold text-gray-900 mb-1">No runs yet</h3>
              <p className="text-xs text-gray-500 mb-5">
                Upload a CSV to run your first enrichment.
              </p>
              <Link
                href="/enrich"
                className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
              >
                Start enriching
              </Link>
            </div>
          ) : (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100 text-left text-gray-400 font-medium">
                    <th className="pl-6 pr-3 py-3">File</th>
                    <th className="px-3 py-3 w-28">Status</th>
                    <th className="px-3 py-3 w-24">Contacts</th>
                    <th className="px-3 py-3 w-28 hidden sm:table-cell">Scoring model</th>
                    <th className="px-3 py-3 w-36 hidden md:table-cell">Date</th>
                    <th className="pl-3 pr-6 py-3 w-20 text-right">Results</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {runs.map((run) => {
                    const cfg = STATUS_CONFIG[run.status] ?? STATUS_CONFIG.pending
                    const enrichRate =
                      run.totalContacts > 0
                        ? Math.round((run.enrichedCount / run.totalContacts) * 100)
                        : 0
                    const canViewResults = run.status === 'complete'

                    return (
                      <tr key={run.id} className="hover:bg-gray-50/50 transition-colors">
                        {/* File name */}
                        <td className="pl-6 pr-3 py-3.5 max-w-[220px]">
                          <p className="font-medium text-gray-800 truncate">{run.name ?? run.originalFilename}</p>
                          <p className="text-[10px] text-gray-400 mt-0.5">{run.originalFilename} · {formatDate(run.createdAt)}</p>
                        </td>

                        {/* Status */}
                        <td className="px-3 py-3.5">
                          <span className={`inline-flex items-center gap-1 text-[10px] font-medium border px-1.5 py-0.5 rounded-full ${cfg.text}`}>
                            <span className={`w-1 h-1 rounded-full ${cfg.dot}`} />
                            {cfg.label}
                          </span>
                        </td>

                        {/* Contacts */}
                        <td className="px-3 py-3.5 tabular-nums text-gray-600">
                          <span className="font-medium">{run.enrichedCount}</span>
                          <span className="text-gray-400">/{run.totalContacts}</span>
                          {run.status === 'complete' && (
                            <span className="ml-1 text-[10px] text-gray-400">({enrichRate}%)</span>
                          )}
                        </td>

                        {/* Scoring model */}
                        <td className="px-3 py-3.5 hidden sm:table-cell text-gray-500">
                          {run.model?.name ?? <span className="text-gray-300 italic">—</span>}
                        </td>

                        {/* Completed date */}
                        <td className="px-3 py-3.5 hidden md:table-cell text-gray-400">
                          {run.completedAt ? formatDate(run.completedAt) : '—'}
                        </td>

                        {/* Action */}
                        <td className="pl-3 pr-6 py-3.5 text-right">
                          {canViewResults ? (
                            <Link
                              href={`/run/${run.id}/results`}
                              className="text-[11px] font-medium text-blue-600 hover:text-blue-700 hover:underline"
                            >
                              View results →
                            </Link>
                          ) : (
                            <span className="text-[11px] text-gray-300">—</span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </>
  )
}
