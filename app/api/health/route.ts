import { NextResponse } from 'next/server'
import prisma from '@/app/lib/prisma'

/**
 * GET /api/health
 *
 * Verifies the application is running and the database connection is healthy.
 * Queries scoring_models count as a lightweight DB liveness check.
 *
 * Response:
 *   200 { status: 'ok', scoring_models: number, timestamp: string }
 *   500 { status: 'error', message: string }
 */
export async function GET() {
  try {
    const count = await prisma.scoringModel.count()

    return NextResponse.json(
      {
        status: 'ok',
        scoring_models: count,
        timestamp: new Date().toISOString(),
      },
      { status: 200 }
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[health] DB check failed:', message)

    return NextResponse.json(
      {
        status: 'error',
        message,
      },
      { status: 500 }
    )
  }
}
