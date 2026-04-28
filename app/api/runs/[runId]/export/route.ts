import { NextRequest } from 'next/server'
import prisma from '@/app/lib/prisma'
import { auth } from '@/app/lib/auth'
import { buildCsvContent } from '@/app/lib/export'
import { getPlanLimitsFor } from '@/app/lib/quota'

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

  // Read the user's org and plan directly from the DB — session snapshots can
  // lag if the session-callback DB read fails silently (plan defaults to 'free').
  const dbUser = await prisma.user.findUnique({
    where:  { id: session.user.id },
    select: { orgId: true, org: { select: { plan: true } } },
  })
  const userOrgId = dbUser?.orgId ?? null

  if (run.orgId && userOrgId && run.orgId !== userOrgId) {
    return new Response(JSON.stringify({ error: 'Forbidden' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const plan = (dbUser?.org?.plan ?? 'free') as string
  const { exportEnabled } = await getPlanLimitsFor(plan)

  if (!exportEnabled) {
    return new Response(JSON.stringify({ error: 'plan_required', requiredPlan: 'starter' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const results = await prisma.runResult.findMany({
    where: {
      runId,
      enrichmentStatus: 'success',
      linkedinUrl: { contains: 'linkedin' },
    },
    select:  { linkedinUrl: true, totalScore: true, enrichedData: true },
    orderBy: { totalScore: 'desc' },
  })

  const rows = results.map((r) => ({
    linkedinUrl:  r.linkedinUrl,
    totalScore:   r.totalScore ? Number(r.totalScore) : null,
    enrichedData: r.enrichedData as Record<string, unknown> | null,
  }))

  const csv      = buildCsvContent(rows)
  const baseName = run.originalFilename.replace(/\.csv$/i, '')
  const filename = `${baseName}_scores.csv`

  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}
