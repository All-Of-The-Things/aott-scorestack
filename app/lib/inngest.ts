import { Inngest } from 'inngest'
import prisma from '@/app/lib/prisma'
import { RunStatus, EnrichmentStatus } from '@/app/generated/prisma'
import { parseCSV } from '@/app/lib/csv'
import { fetchProfile } from '@/app/lib/linkedapi'
import { sendEnrichmentStarted, sendEnrichmentComplete } from '@/app/lib/notify'
import { get } from '@vercel/blob'
import { InputJsonObject } from '@prisma/client/runtime/client'

export const inngest = new Inngest({ id: 'scorestack' })

// ---------------------------------------------------------------------------
// enrich-contacts
//
// Triggered by event 'enrich/contacts.requested' with { runId: string }.
// Runs the full enrichment loop outside Vercel's function timeout.
// Writes RunResult rows progressively so partial results are available.
// ---------------------------------------------------------------------------

export const enrichContacts = inngest.createFunction(
  { id: 'enrich-contacts', retries: 1, triggers: [{ event: 'enrich/contacts.requested' }] },
  async ({ event }: { event: { data: { runId: string } } }) => {
    const { runId } = event.data

    const run = await prisma.run.findUnique({
      where: { id: runId },
      select: {
        id: true,
        blobUrl: true,
        linkedinColumn: true,
        notifyEmail: true,
        orgId: true,
        totalContacts: true,
      },
    })

    if (!run || !run.blobUrl || !run.linkedinColumn) {
      await prisma.run.update({ where: { id: runId }, data: { status: RunStatus.failed } })
      return { error: 'run_not_found_or_incomplete' }
    }

    await prisma.run.update({ where: { id: runId }, data: { status: RunStatus.enriching } })

    // Fetch CSV from Vercel Blob
    let csvText: string
    try {
      const blob = await get(run.blobUrl, {
        access: 'private',
        token: process.env.BLOB_READ_WRITE_TOKEN ?? process.env.VERCEL_BLOB_TOKEN,
      })
      if (!(blob?.statusCode === 200)) throw new Error(`Blob fetch failed: ${blob?.statusCode}`)
      csvText = await new Response(blob.stream).text()
    } catch (err) {
      console.error('[inngest/enrich] Blob fetch failed:', err)
      await prisma.run.update({ where: { id: runId }, data: { status: RunStatus.failed } })
      return { error: 'blob_fetch_failed' }
    }

    // Parse CSV
    let rows: Record<string, string>[]
    try {
      const parsed = parseCSV(csvText)
      rows = parsed.rows
    } catch (err) {
      console.error('[inngest/enrich] CSV parse failed:', err)
      await prisma.run.update({ where: { id: runId }, data: { status: RunStatus.failed } })
      return { error: 'csv_parse_failed' }
    }

    // Free-plan quota cap — applied before the loop
    const FREE_RUN_LIMIT = 50
    const isFree = !run.orgId
    if (isFree && rows.length > FREE_RUN_LIMIT) {
      rows = rows.slice(0, FREE_RUN_LIMIT)
    }

    await prisma.run.update({
      where: { id: runId },
      data: { totalContacts: rows.length, originalTotalContacts: rows.length },
    })

    if (run.notifyEmail) {
      try {
        await sendEnrichmentStarted(run.notifyEmail, runId, rows.length)
      } catch (err) {
        console.error('[inngest/enrich] Failed to send start email:', err)
      }
    }

    let enrichedCount = 0
    let failedCount = 0
    let cumulativeMs = 0
    const enrichmentStart = Date.now()

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]!
      const linkedinUrl = (row[run.linkedinColumn] ?? '').trim()

      const contactStart = Date.now()
      const result = await fetchProfile(linkedinUrl)
      cumulativeMs += Date.now() - contactStart

      // Hard-stop: provider-level failure — no further contacts will succeed
      if (result.abort) {
        await prisma.run.update({
          where: { id: runId },
          data: { status: RunStatus.failed, enrichedCount, failedCount },
        })
        return { error: 'provider_abort', code: result.abortCode ?? 'provider_unavailable' }
      }

      await prisma.runResult.create({
        data: {
          runId,
          rowIndex: i,
          linkedinUrl: linkedinUrl || `row_${i}`,
          enrichedData: result.profile as unknown as InputJsonObject ?? undefined,
          enrichmentStatus: result.status as EnrichmentStatus,
        },
      })

      if (result.status === 'success') enrichedCount++
      else failedCount++
    }

    const totalEnrichmentMs = Date.now() - enrichmentStart
    const avgEnrichmentMs = rows.length > 0 ? Math.round(cumulativeMs / rows.length) : 0

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

    if (run.orgId) {
      await prisma.usageLog.create({
        data: {
          orgId: run.orgId,
          runId,
          contactsConsumed: enrichedCount,
          enrichmentSource: 'managed_credits',
        },
      })
    }

    // Send completion email (deduped via EnrichmentNotification)
    if (run.notifyEmail) {
      try {
        const alreadySent = await prisma.enrichmentNotification.findUnique({ where: { runId } })
        if (!alreadySent) {
          await sendEnrichmentComplete(run.notifyEmail, runId)
          await prisma.enrichmentNotification.create({
            data: { runId, email: run.notifyEmail, sentAt: new Date() },
          })
        }
      } catch (err) {
        console.error('[inngest/enrich] Failed to send completion email:', err)
      }
    }

    return { enrichedCount, failedCount, totalEnrichmentMs }
  },
)
