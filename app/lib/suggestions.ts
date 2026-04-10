import Anthropic from '@anthropic-ai/sdk'
import type { Criterion } from './scoring'

export interface EnrichedSample {
  linkedin_url: string
  enriched_data: Record<string, unknown> | null
}

/**
 * Use the Anthropic API to suggest scoring criteria based on a sample of enriched contacts.
 *
 * Sends the first 5–10 contacts' enriched profiles to Claude, which analyzes
 * common patterns across the sample (titles, seniority, industry, company size)
 * and returns a suggested criteria array that can pre-populate the CriteriaBuilder UI.
 *
 * The result is returned to the caller — the API route (/api/suggest) is responsible
 * for persisting it to runs.ai_suggested_criteria for audit trail purposes.
 *
 * Requires ANTHROPIC_API_KEY env var.
 */
export async function suggestCriteria(enrichedSample: EnrichedSample[]): Promise<Criterion[]> {
  const apiKey = process.env.ANTHROPIC_API_KEY_APP || process.env.ANTHROPIC_API_KEY

  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY environment variable is not set')
  }

  const client = new Anthropic({ apiKey })

  // Trim sample to 10 contacts max
  const sample = enrichedSample.slice(0, 10)

  const sampleSummary = sample.map((s, i) => ({
    index: i + 1,
    linkedin_url: s.linkedin_url,
    ...(s.enriched_data ?? {}),
  }))

  const systemPrompt = `You are a B2B sales and recruiting expert. You help users define scoring criteria to rank contact lists by fit.

You will receive a sample of enriched LinkedIn profiles and must suggest 3–5 scoring criteria that would help rank contacts by their likely fit for outreach.

Return ONLY a valid JSON array of criteria objects. No explanation, no markdown, no wrapping text — just the raw JSON array.

Each criterion must match this TypeScript interface:
{
  field: string            // one of: current_title, seniority, company_name, industry, company_size, location
  match_type: 'exact' | 'list' | 'range'
  match_values: string[]   // for 'exact': single value; for 'list': array of values; for 'range': [min, max] as strings
  score_if_match: number   // 0–100
  score_if_no_match: number // 0–100
  weight: number           // weights across all criteria MUST sum to exactly 100
}

Guidelines:
- Prefer 'list' for titles/seniority/industry (multiple acceptable values)
- Prefer 'range' for company_size (e.g. headcount ranges)
- Prefer 'exact' only for single-value matches
- Assign higher weights to the most discriminating criteria
- Ensure weights sum to exactly 100`

  const userMessage = `Here is a sample of enriched contacts from the user's list:\n\n${JSON.stringify(sampleSummary, null, 2)}\n\nSuggest scoring criteria for this contact list.`

  const message = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    system: systemPrompt,
    messages: [{ role: 'user', content: userMessage }],
  })

  const textBlock = message.content.find((b) => b.type === 'text')
  if (!textBlock || textBlock.type !== 'text') {
    throw new Error('Anthropic API returned no text content')
  }

  let criteria: Criterion[]
  try {
    // Strip any accidental markdown code fences before parsing
    const cleaned = textBlock.text.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim()
    criteria = JSON.parse(cleaned)
  } catch {
    throw new Error(`Failed to parse Anthropic response as JSON: ${textBlock.text.slice(0, 200)}`)
  }

  if (!Array.isArray(criteria)) {
    throw new Error('Anthropic response was not a JSON array')
  }

  return criteria
}
