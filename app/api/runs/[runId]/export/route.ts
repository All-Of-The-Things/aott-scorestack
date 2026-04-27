import { NextRequest } from 'next/server'
import prisma from '@/app/lib/prisma'
import { auth } from '@/app/lib/auth'
import { buildCsvContent } from '@/app/lib/export'

const FREE_EXPORT_LIMIT = 10

export async function GET(
  _req: NextRequest,
  { params }: { params: { runId: string } }
) {
  const session = await auth()
  if (!session) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const { runId } = params
  const run = await prisma.run.findUnique({
    where: { id: runId },
    select: { id: true, originalFilename: true, orgId: true },
  })
  if (!run) {
    return new Response(JSON.stringify({ error: 'Not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const plan   = (session.user?.plan ?? 'free') as string
  const isFree = !run.orgId || plan === 'free'
  const limit  = isFree ? FREE_EXPORT_LIMIT : undefined

  const results = await prisma.runResult.findMany({
    where: {
      runId,
      enrichmentStatus: 'success',
      linkedinUrl: { contains: 'linkedin' },
    },
    select:  { linkedinUrl: true, totalScore: true, enrichedData: true },
    orderBy: { totalScore: 'desc' },
    ...(limit !== undefined ? { take: limit } : {}),
  })

  const rows = results.map((r) => ({
    linkedinUrl:  r.linkedinUrl,
    totalScore:   r.totalScore ? Number(r.totalScore) : null,
    enrichedData: r.enrichedData as Record<string, unknown> | null,
  }))

  const csv      = buildCsvContent(rows)
  const baseName = run.originalFilename.replace(/\.csv$/i, '')
  const suffix   = isFree ? `_top${FREE_EXPORT_LIMIT}` : ''
  const filename = `${baseName}_scores${suffix}.csv`

  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}
