import { NextRequest } from 'next/server'
import { z } from 'zod'
import prisma from '@/app/lib/prisma'
import { RunStatus, EnrichmentStatus } from '@/app/generated/prisma'
import { parseCSV } from '@/app/lib/csv'
import { fetchProfile } from '@/app/lib/linkedapi'
import { InputJsonObject } from '@prisma/client/runtime/client'
import { error } from 'console'
import { get } from '@vercel/blob'

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const EnrichBodySchema = z.object({
  blob_url: z.string().url(),
  linkedin_column: z.string().min(1),
  original_filename: z.string().default('upload.csv'),
})

// ---------------------------------------------------------------------------
// SSE helpers
// ---------------------------------------------------------------------------

function sseMessage(data: object): string {
  return `data: ${JSON.stringify(data)}\n\n`
}

// ---------------------------------------------------------------------------
// POST /api/enrich
//
// Accepts:
//   { blob_url: string, linkedin_column: string, original_filename?: string }
//
// Steps:
//   1. Validate request body
//   2. Create a `runs` record with status 'enriching'
//   3. Fetch the CSV from Vercel Blob (blob_url)
//   4. Parse CSV with parseCSV(), extract LinkedIn URLs from linkedin_column
//   5. For each URL:
//      a. Call fetchProfile() from lib/linkedapi.ts
//      b. Insert a run_results row with enriched_data or enrichment_status: 'failed'
//      c. Stream SSE event: { type: 'progress', current, total, contact_name }
//   6. Update runs.status → 'scoring', runs.enriched_count, runs.failed_count
//   7. Stream final SSE event: { type: 'complete', run_id }
//
// Streaming:
//   Uses ReadableStream with Server-Sent Events (text/event-stream).
//   The client should listen with EventSource on a wrapping fetch (EventSource
//   does not support POST — use a fetch + ReadableStream reader on the client).
//
// LinkedAPI integration:
//   fetchProfile() uses the @linkedapi/node SDK (fetchPerson workflow).
//   The SDK handles auth, retries, and polling internally.
//   Calls are sequential to respect LinkedAPI rate limits.
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  // Parse + validate body
  let body: z.infer<typeof EnrichBodySchema>
  try {
    const raw = await request.json()
    body = EnrichBodySchema.parse(raw)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Invalid request body'
    return new Response(JSON.stringify({ error: message }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const { blob_url, linkedin_column, original_filename } = body

  // Set up SSE stream
  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: object) => {
        controller.enqueue(encoder.encode(sseMessage(data)))
      }

      // Create run record
      let runId: string
      try {
        const run = await prisma.run.create({
          data: {
            originalFilename: original_filename,
            status: RunStatus.enriching,
            totalContacts: 0,
            enrichedCount: 0,
            failedCount: 0,
          },
        })
        runId = run.id
      } catch (err) {
        send({ type: 'error', message: 'Failed to create run record', error: err instanceof Error ? err.message : error })
        controller.close()
        return
      }

      // Fetch CSV from Vercel Blob
      let csvText: string
      try {
        const blob = await get(blob_url, {access: 'private', token: process.env.VERCEL_BLOB_TOKEN!})
        
        if (!(blob?.statusCode === 200)) {
          throw new Error(`Blob fetch failed: ${blob?.statusCode}`)
        }

        csvText = await new Response(blob.stream).text()
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to fetch CSV from blob'
        await prisma.run.update({ where: { id: runId }, data: { status: RunStatus.failed } })
        send({ type: 'error', message })
        controller.close()
        return
      }

      // Parse CSV
      let rows: Record<string, string>[]
      try {
        const parsed = parseCSV(csvText)
        rows = parsed.rows
      } catch (err) {
        const message = err instanceof Error ? err.message : 'CSV parse failed'
        await prisma.run.update({ where: { id: runId }, data: { status: RunStatus.failed } })
        send({ type: 'error', message })
        controller.close()
        return
      }

      // Update total_contacts count
      await prisma.run.update({
        where: { id: runId },
        data: { totalContacts: rows.length },
      })

      let enrichedCount = 0
      let failedCount = 0
      let cumulativeMs = 0
      const enrichmentStart = Date.now()

      // Enrich each contact sequentially
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i]!
        const linkedinUrl = (row[linkedin_column] ?? '').trim()

        const contactStart = Date.now()
        const result = await fetchProfile(linkedinUrl)
        const contactMs = Date.now() - contactStart
        cumulativeMs += contactMs

        const completed = i + 1
        const avgMsPerContact = Math.round(cumulativeMs / completed)
        const estimatedRemainingMs = avgMsPerContact * (rows.length - completed)

        const contactName =
          (result.profile?.full_name ??
          result.profile?.first_name ??
          linkedinUrl) ||
          `Row ${i + 1}`

        // Persist run_result row
        await prisma.runResult.create({
          data: {
            runId,
            rowIndex: i,
            linkedinUrl: linkedinUrl || `row_${i}`,
            enrichedData: result.profile as unknown as InputJsonObject ?? undefined,
            enrichmentStatus: result.status as EnrichmentStatus,
          },
        })

        if (result.status === 'success') {
          enrichedCount++
        } else {
          failedCount++
        }

        send({
          type: 'progress',
          current: completed,
          total: rows.length,
          contact_name: contactName,
          enrichment_status: result.status,
          avg_ms_per_contact: avgMsPerContact,
          estimated_remaining_ms: estimatedRemainingMs,
        })
      }

      const totalEnrichmentMs = Date.now() - enrichmentStart
      const avgEnrichmentMs = rows.length > 0
        ? Math.round(cumulativeMs / rows.length)
        : 0

      // Finalize run
      await prisma.run.update({
        where: { id: runId },
        data: {
          status: RunStatus.scoring,
          enrichedCount,
          failedCount,
          avgEnrichmentMs,
          totalEnrichmentMs,
        },
      })

      send({ type: 'complete', run_id: runId })
      controller.close()
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  })
}
