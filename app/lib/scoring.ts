export type MatchType = 'exact' | 'list' | 'range'

export interface Criterion {
  field: string
  match_type: MatchType
  match_values: string[] // for 'exact' and 'list'; for 'range': [minStr, maxStr]
  score_if_match: number // 0–100
  score_if_no_match: number // 0–100
  weight: number // 0–100; all weights across criteria must sum to 100
}

export interface CriterionScore {
  field: string
  raw_value: string | null
  matched: boolean
  score: number // score_if_match or score_if_no_match
  weight: number
  weighted_contribution: number // score * (weight / 100)
}

export interface ScoredContact {
  total_score: number
  criterion_scores: CriterionScore[]
}

/**
 * Compute a weighted additive score for a single contact's enriched data
 * against an array of scoring criteria.
 *
 * Formula per criterion:
 *   weighted_contribution = (score_if_match | score_if_no_match) × (weight / 100)
 *
 * total_score = sum of all weighted_contributions
 *
 * Match evaluation:
 *   - 'exact': enriched_data[field] equals match_values[0] (case-insensitive)
 *   - 'list':  enriched_data[field] is in match_values array (case-insensitive)
 *   - 'range': enriched_data[field] (as number) is between match_values[0] and match_values[1] (inclusive)
 *
 * Missing or null enriched fields always result in score_if_no_match.
 */
export function computeScores(
  enrichedData: Record<string, unknown> | null,
  criteria: Criterion[]
): ScoredContact {
  const criterion_scores: CriterionScore[] = []
  let total_score = 0

  for (const criterion of criteria) {
    const rawValue = enrichedData ? (enrichedData[criterion.field] ?? null) : null
    const rawStr = rawValue !== null ? String(rawValue) : null

    const matched = rawStr !== null ? evaluateMatch(rawStr, criterion) : false
    const score = matched ? criterion.score_if_match : criterion.score_if_no_match
    const weighted_contribution = score * (criterion.weight / 100)

    criterion_scores.push({
      field: criterion.field,
      raw_value: rawStr,
      matched,
      score,
      weight: criterion.weight,
      weighted_contribution,
    })

    total_score += weighted_contribution
  }

  return {
    total_score: Math.round(total_score * 100) / 100, // round to 2 decimal places
    criterion_scores,
  }
}

function evaluateMatch(value: string, criterion: Criterion): boolean {
  const { match_type, match_values } = criterion

  switch (match_type) {
    case 'exact': {
      const target = (match_values[0] ?? '').toLowerCase().trim()
      return value.toLowerCase().trim() === target
    }

    case 'list': {
      const lowerValue = value.toLowerCase().trim()
      return match_values.some((mv) => mv.toLowerCase().trim() === lowerValue)
    }

    case 'range': {
      const num = parseFloat(value)
      if (isNaN(num)) return false
      const min = parseFloat(match_values[0] ?? '')
      const max = parseFloat(match_values[1] ?? '')
      const aboveMin = isNaN(min) || num >= min
      const belowMax = isNaN(max) || num <= max
      return aboveMin && belowMax
    }

    default:
      return false
  }
}
