import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import prisma from '@/app/lib/prisma'

const Body = z.object({ email: z.string().email() })

// PATCH /api/runs/:runId/email
//
// Stores an email on Run.notifyEmail for either:
//   - the "Notify me" deferred enrichment path
//   - the results gate (email captured before showing scored results)
//
// Idempotent: if notifyEmail is already set, returns the existing value
// without overwriting. No auth required — runId obscurity is sufficient.
export async function PATCH(
  request: NextRequest,
  { params }: { params: { runId: string } }
) {
  const { runId } = params

  let email: string
  try {
    const raw = await request.json()
    email = Body.parse(raw).email
  } catch {
    return NextResponse.json({ error: 'Invalid email' }, { status: 422 })
  }

  const run = await prisma.run.findUnique({
    where: { id: runId },
    select: { notifyEmail: true },
  })
  if (!run) return NextResponse.json({ error: 'Run not found' }, { status: 404 })

  // Idempotent — don't overwrite an existing email
  if (run.notifyEmail) {
    return NextResponse.json({ email: run.notifyEmail })
  }

  await prisma.run.update({
    where: { id: runId },
    data: { notifyEmail: email },
  })

  return NextResponse.json({ email })
}
