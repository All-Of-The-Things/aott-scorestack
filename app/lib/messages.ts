import Anthropic from '@anthropic-ai/sdk'
import prisma from '@/app/lib/prisma'
import { EnrichmentStatus } from '@/app/generated/prisma'
import { DEFAULT_SYSTEM_PROMPT } from '@/app/lib/message-defaults'

export { DEFAULT_SYSTEM_PROMPT }

export async function generateMessages(
  runId: string,
  templateId: string,
  contactIds?: string[],
): Promise<{ generated: number; failed: number }> {
  const [results, template] = await Promise.all([
    prisma.runResult.findMany({
      where: {
        runId,
        enrichmentStatus: EnrichmentStatus.success,
        ...(contactIds ? { id: { in: contactIds } } : {}),
      },
      orderBy: [{ totalScore: 'desc' }, { rowIndex: 'asc' }],
    }),
    prisma.messageTemplate.findUnique({ where: { id: templateId } }),
  ])

  if (!template) throw new Error(`MessageTemplate ${templateId} not found`)

  if (process.env.ANTHROPIC_ENABLED !== 'true') {
    console.warn('Anthropic API calls are disabled by ANTHROPIC_ENABLED=false — returning mock messages')
    let generated = 0
    for (const result of results) {
      await prisma.generatedMessage.upsert({
        where: { runResultId_templateId: { runResultId: result.id, templateId } },
        update: { body: `[Mock] Hi! I noticed your background at ${String((result.enrichedData as Record<string, unknown>)?.company_name ?? 'your company')} and think we should connect.`, editedBody: null, generatedAt: new Date() },
        create: { runResultId: result.id, templateId, body: `[Mock] Hi! I noticed your background at ${String((result.enrichedData as Record<string, unknown>)?.company_name ?? 'your company')} and think we should connect.` },
      })
      generated++
    }
    return { generated, failed: 0 }
  }

  const apiKey = process.env.ANTHROPIC_API_KEY_APP || process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY environment variable is not set')

  const client = new Anthropic({ apiKey })
  const systemPrompt = template.systemPrompt || DEFAULT_SYSTEM_PROMPT

  let generated = 0
  let failed = 0

  async function generateOne(result: typeof results[number]): Promise<void> {
    try {
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
              enrichedData: result.enrichedData,
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

      await prisma.generatedMessage.upsert({
        where: { runResultId_templateId: { runResultId: result.id, templateId } },
        update: { body: parsed.body, editedBody: null, generatedAt: new Date() },
        create: { runResultId: result.id, templateId, body: parsed.body },
      })
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
