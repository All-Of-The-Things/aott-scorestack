import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/app/lib/prisma'

export async function GET(
  _request: NextRequest,
  { params }: { params: { runId: string } }
) {
  const [run, processedCount, lastResult] = await Promise.all([
    prisma.run.findUnique({
      where: { id: params.runId },
      select: {
        status: true,
        enrichedCount: true,
        failedCount: true,
        totalContacts: true,
        completedAt: true,
      },
    }),
    prisma.runResult.count({ where: { runId: params.runId } }),
    prisma.runResult.findFirst({
      where: { runId: params.runId },
      orderBy: { rowIndex: 'desc' },
      select: { linkedinUrl: true, enrichedData: true },
    }),
  ])

  if (!run) return NextResponse.json({ error: 'Run not found' }, { status: 404 })

  const profile = lastResult?.enrichedData as Record<string, unknown> | null
  const lastContactName =
    (profile?.full_name as string | null) ??
    ([profile?.first_name, profile?.last_name].filter(Boolean).join(' ') || null)

  return NextResponse.json({
    ...run,
    processedCount,
    lastContactUrl: lastResult?.linkedinUrl ?? null,
    lastContactName,
  })
}
