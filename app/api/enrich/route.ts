import { NextRequest } from 'next/server'
import { z } from 'zod'
import prisma from '@/app/lib/prisma'
import { auth } from '@/app/lib/auth'
import { getPlanLimitsFor } from '@/app/lib/quota'
import { RunStatus } from '@/app/generated/prisma'
import { inngest } from '@/app/lib/inngest'
import { fetchCompanyByUrl } from '@/app/lib/linkedapi'
import { Prisma } from '@/app/generated/prisma'

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const EnrichBodySchema = z.object({
  blob_url:              z.string().url(),
  linkedin_column:       z.string().min(1),
  original_filename:     z.string().default('upload.csv'),
  notify_email:          z.string().email(),
  name:                  z.string().optional(),
  company_linkedin_url:  z.string().url().optional().nullable(),
})

// ---------------------------------------------------------------------------
// POST /api/enrich
//
// Creates a Run record, triggers the Inngest enrich-contacts background job,
// and returns { run_id } immediately. Enrichment runs outside Vercel's timeout.
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  let body: z.infer<typeof EnrichBodySchema>
  try {
    const raw = await request.json()
    body = EnrichBodySchema.parse(raw)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Invalid request body'
    return Response.json({ error: message }, { status: 400 })
  }

  const { blob_url, linkedin_column, original_filename, notify_email, name, company_linkedin_url } = body

  const session = await auth()
  const userId = session?.user?.id    ?? null
  const orgId  = session?.user?.orgId ?? null
  const plan   = (session?.user?.plan ?? 'free') as string

  const limits = await getPlanLimitsFor(orgId ? plan : 'free')

  // Free plan: cap total enrichment runs
  if (limits.isFree && orgId) {
    const runCount = await prisma.run.count({
      where: { orgId, status: { in: ['enriching', 'scoring', 'complete'] } },
    })
    if (runCount >= 5) {
      return Response.json({ error: 'run_limit_reached' }, { status: 402 })
    }
  }

  // Persist company URL on org and kick off enrichment (best-effort, non-blocking)
  if (orgId && company_linkedin_url) {
    void prisma.organization.update({
      where: { id: orgId },
      data: { companyLinkedInUrl: company_linkedin_url },
    }).then(() =>
      fetchCompanyByUrl(company_linkedin_url)
        .then((data) => {
          if (data) return prisma.organization.update({ where: { id: orgId }, data: { companyData: data as unknown as Prisma.InputJsonValue } })
        })
        .catch((err) => console.warn('[enrich] company enrichment failed, skipping:', err))
    ).catch((err) => console.warn('[enrich] failed to save company URL:', err))
  }

  // Create run record
  let runId: string
  try {
    const run = await prisma.run.create({
      data: {
        name:             name ?? null,
        originalFilename: original_filename,
        blobUrl:          blob_url,
        linkedinColumn:   linkedin_column,
        status:           RunStatus.pending,
        totalContacts:    0,
        enrichedCount:    0,
        failedCount:      0,
        notifyEmail:      notify_email,
        ...(userId ? { userId } : {}),
        ...(orgId  ? { orgId  } : {}),
      },
    })
    runId = run.id
  } catch (err) {
    console.error('[enrich] Failed to create run:', err)
    return Response.json({ error: 'Failed to create enrichment run.' }, { status: 500 })
  }

  // Trigger background enrichment via Inngest
  try {
    await inngest.send({ name: 'enrich/contacts.requested', data: { runId } })
  } catch (err) {
    console.error('[enrich] Failed to trigger Inngest event:', err)
    await prisma.run.update({ where: { id: runId }, data: { status: RunStatus.failed } })
    return Response.json({ error: 'Failed to start enrichment job.' }, { status: 500 })
  }

  return Response.json({ run_id: runId })
}
