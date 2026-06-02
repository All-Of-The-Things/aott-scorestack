import Anthropic from '@anthropic-ai/sdk'
import prisma from '@/app/lib/prisma'
import { EnrichmentStatus } from '@/app/generated/prisma'
import { DEFAULT_SYSTEM_PROMPT, JSON_OUTPUT_SUFFIX, buildSenderContext } from '@/app/lib/message-defaults'

export { DEFAULT_SYSTEM_PROMPT }

export async function generateMessages(
  runId: string,
  templateId: string,
  contactIds?: string[],
): Promise<{ generated: number; failed: number }> {
  const [results, template, run] = await Promise.all([
    prisma.runResult.findMany({
      where: {
        runId,
        enrichmentStatus: EnrichmentStatus.success,
        ...(contactIds ? { id: { in: contactIds } } : {}),
      },
      orderBy: [{ totalScore: 'desc' }, { rowIndex: 'asc' }],
    }),
    prisma.messageTemplate.findUnique({ where: { id: templateId } }),
    prisma.run.findUnique({
      where: { id: runId },
      select: { org: { select: { companyLinkedInUrl: true, companyData: true } } },
    }),
  ])

  if (!template) throw new Error(`MessageTemplate ${templateId} not found`)

  const senderContext = buildSenderContext(
    run?.org?.companyLinkedInUrl ?? null,
    (run?.org?.companyData ?? null) as { name?: string | null; industry?: string | null; company_size?: string | null } | null,
  )

  if (process.env.ANTHROPIC_ENABLED !== 'true') {
    console.warn('Anthropic API calls are disabled by ANTHROPIC_ENABLED=false — returning mock messages')
    let generated = 0
    for (const result of results) {
      const mockBody = `[Mock] Hi! I noticed your background at ${String((result.enrichedData as Record<string, unknown>)?.company_name ?? 'your company')} and think we should connect.`
      const existing = await prisma.generatedMessage.findFirst({
        where: { runResultId: result.id, templateId },
        select: { id: true },
      })
      if (existing) {
        await prisma.generatedMessage.update({
          where: { id: existing.id },
          data: { body: mockBody, editedBody: null, generatedAt: new Date() },
        })
      } else {
        await prisma.generatedMessage.create({
          data: { runResultId: result.id, templateId, body: mockBody },
        })
      }
      generated++
    }
    return { generated, failed: 0 }
  }

  const apiKey = process.env.ANTHROPIC_API_KEY_APP || process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY environment variable is not set')

  const client = new Anthropic({ apiKey })
  // Prepend sender context (if set), then append the JSON output constraint.
  const systemPrompt = senderContext + (template.systemPrompt || DEFAULT_SYSTEM_PROMPT) + JSON_OUTPUT_SUFFIX

  let generated = 0
  let failed = 0

  async function generateOne(result: typeof results[number]): Promise<void> {
    try {
      const enriched = (result.enrichedData ?? {}) as Record<string, unknown>
      const firstName =
        (enriched.first_name as string | null | undefined) ??
        (enriched.full_name as string | null | undefined)?.split(' ')[0] ??
        null

      const response = await client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 500,
        system: [
          {
            type: 'text',
            text: systemPrompt,
            cache_control: { type: 'ephemeral' },
          },
        ],
        messages: [
          {
            role: 'user',
            content: JSON.stringify({
              enrichedData: { ...enriched, first_name: firstName },
              criterionScores: result.criterionScores,
            }),
          },
        ],
      })

      const textBlock = response.content.find((b) => b.type === 'text')
      if (!textBlock || textBlock.type !== 'text') throw new Error('No text content in response')

      const cleaned = textBlock.text.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim()
      const parsed = JSON.parse(cleaned) as { body: string }
      if (typeof parsed.body !== 'string') throw new Error('Response missing body field')

      const existing = await prisma.generatedMessage.findFirst({
        where: { runResultId: result.id, templateId },
        select: { id: true },
      })
      if (existing) {
        await prisma.generatedMessage.update({
          where: { id: existing.id },
          data: { body: parsed.body, editedBody: null, generatedAt: new Date() },
        })
      } else {
        await prisma.generatedMessage.create({
          data: { runResultId: result.id, templateId, body: parsed.body },
        })
      }
      generated++
    } catch (err) {
      console.error(`generateMessages: failed for runResult ${result.id}:`, err)
      failed++
    }
  }

  const BATCH_SIZE = 20
  for (let i = 0; i < results.length; i += BATCH_SIZE) {
    await Promise.all(results.slice(i, i + BATCH_SIZE).map(generateOne))
  }

  return { generated, failed }
}
