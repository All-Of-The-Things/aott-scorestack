'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { Criterion, MatchType } from '@/app/lib/scoring'

// ---------------------------------------------------------------------------
// CriteriaBuilder — client component
//
// Renders on /run/[runId]/score. Allows the user to:
//   1. Ask AI to suggest criteria  → POST /api/suggest { run_id }
//   2. Edit the returned criteria  → add/remove rows, change weights/values
//   3. Validate weights sum to 100 → inline error
//   4. Submit for scoring          → POST /api/score  { run_id, criteria }
//                                  → on success: router.push(`/run/${runId}/results`)
//
// Props:
//   runId          — the run UUID (passed from the server page)
//   availableFields — array of field keys present in enriched data, e.g. ['seniority', 'industry']
//                     derived by the parent server component from runResult rows
//
// If `initialCriteria` is provided (e.g. from `runs.ai_suggested_criteria`),
// the form pre-populates on mount so the user sees them immediately without
// clicking "Suggest criteria for me" again. The user can still edit or replace.
// ---------------------------------------------------------------------------

interface CriteriaBuilderProps {
  runId: string
  availableFields: string[]
  initialCriteria?: Criterion[]
}

const FIELD_LABELS: Record<string, string> = {
  current_title: 'Current Title',
  seniority: 'Seniority',
  company_name: 'Company',
  industry: 'Industry',
  company_size: 'Company Size',
  location: 'Location',
}

const MATCH_TYPE_OPTIONS: { value: MatchType; label: string }[] = [
  { value: 'exact', label: 'Exact match' },
  { value: 'list', label: 'One of list' },
  { value: 'range', label: 'Numeric range' },
]

function emptyCriterion(field: string): Criterion {
  return {
    field,
    match_type: 'list',
    match_values: [],
    score_if_match: 100,
    score_if_no_match: 0,
    weight: 0,
  }
}

export default function CriteriaBuilder({ runId, availableFields, initialCriteria = [] }: CriteriaBuilderProps) {
  const router = useRouter()
  const [criteria, setCriteria] = useState<Criterion[]>(initialCriteria)
  const [suggesting, setSuggesting] = useState(false)
  const [scoring, setScoring] = useState(false)
  const [suggestError, setSuggestError] = useState<string | null>(null)
  const [scoreError, setScoreError] = useState<string | null>(null)

  // ---------------------------------------------------------------------------
  // AI suggest
  // ---------------------------------------------------------------------------
  async function handleSuggest() {
    setSuggesting(true)
    setSuggestError(null)
    try {
      const res = await fetch('/api/suggest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ run_id: runId }),
      })
      const data = await res.json()
      if (!res.ok) {
        setSuggestError(data.error ?? 'Suggestion failed')
        return
      }
      setCriteria(data.criteria)
    } catch {
      setSuggestError('Network error — please try again')
    } finally {
      setSuggesting(false)
    }
  }

  // ---------------------------------------------------------------------------
  // Criteria mutations
  // ---------------------------------------------------------------------------
  function addCriterion() {
    const unusedField = availableFields.find((f) => !criteria.some((c) => c.field === f))
    if (!unusedField) return
    setCriteria((prev) => [...prev, emptyCriterion(unusedField)])
  }

  function removeCriterion(index: number) {
    setCriteria((prev) => prev.filter((_, i) => i !== index))
  }

  function updateCriterion(index: number, patch: Partial<Criterion>) {
    setCriteria((prev) =>
      prev.map((c, i) => (i === index ? { ...c, ...patch } : c))
    )
  }

  function updateMatchValues(index: number, raw: string) {
    // Comma-separated for list/exact; two values for range
    const parts = raw.split(',').map((s) => s.trim()).filter(Boolean)
    updateCriterion(index, { match_values: parts })
  }

  // ---------------------------------------------------------------------------
  // Weight validation
  // ---------------------------------------------------------------------------
  const totalWeight = criteria.reduce((sum, c) => sum + (c.weight || 0), 0)
  const weightsValid = criteria.length === 0 || totalWeight === 100

  // ---------------------------------------------------------------------------
  // Submit for scoring
  // ---------------------------------------------------------------------------
  async function handleScore() {
    if (!weightsValid || criteria.length === 0) return
    setScoring(true)
    setScoreError(null)
    try {
      const res = await fetch('/api/score', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ run_id: runId, criteria }),
      })
      const data = await res.json()
      if (!res.ok) {
        setScoreError(data.error ?? 'Scoring failed')
        return
      }
      router.push(`/run/${runId}/results`)
    } catch {
      setScoreError('Network error — please try again')
    } finally {
      setScoring(false)
    }
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-sm font-semibold text-gray-800">Scoring criteria</h2>
          <p className="mt-0.5 text-xs text-gray-400">
            Define how contacts are scored. Weights must sum to 100.
          </p>
        </div>
        <button
          onClick={handleSuggest}
          disabled={suggesting}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-indigo-700 bg-indigo-50 border border-indigo-100 px-3 py-1.5 rounded-lg hover:bg-indigo-100 disabled:opacity-50 transition-colors"
        >
          {suggesting ? 'Thinking…' : '✦ Suggest criteria for me'}
        </button>
      </div>

      {/* Suggest error */}
      {suggestError && (
        <p className="mb-4 text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
          {suggestError}
        </p>
      )}

      {/* Criteria rows */}
      {criteria.length === 0 ? (
        <div className="border border-dashed border-gray-200 rounded-xl px-4 py-8 text-center text-xs text-gray-400">
          No criteria yet — click &ldquo;Suggest criteria for me&rdquo; or add one manually.
        </div>
      ) : (
        <div className="space-y-3 mb-4">
          {criteria.map((criterion, i) => (
            <div
              key={i}
              className="grid grid-cols-[1fr_1fr_1fr_auto_auto_auto] gap-2 items-start p-3 bg-gray-50 rounded-xl border border-gray-100"
            >
              {/* Field */}
              <div>
                <label className="block text-[10px] text-gray-400 mb-1">Field</label>
                <select
                  value={criterion.field}
                  onChange={(e) => updateCriterion(i, { field: e.target.value })}
                  className="w-full text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-indigo-300"
                >
                  {availableFields.map((f) => (
                    <option key={f} value={f}>{FIELD_LABELS[f] ?? f}</option>
                  ))}
                </select>
              </div>

              {/* Match type */}
              <div>
                <label className="block text-[10px] text-gray-400 mb-1">Match type</label>
                <select
                  value={criterion.match_type}
                  onChange={(e) => updateCriterion(i, { match_type: e.target.value as MatchType })}
                  className="w-full text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-indigo-300"
                >
                  {MATCH_TYPE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>

              {/* Values */}
              <div>
                <label className="block text-[10px] text-gray-400 mb-1">
                  {criterion.match_type === 'range' ? 'Min, Max' : 'Values (comma-separated)'}
                </label>
                <input
                  type="text"
                  value={criterion.match_values.join(', ')}
                  onChange={(e) => updateMatchValues(i, e.target.value)}
                  placeholder={criterion.match_type === 'range' ? '50, 500' : 'Director, VP, C-Level'}
                  className="w-full text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-indigo-300"
                />
              </div>

              {/* Score if match */}
              <div>
                <label className="block text-[10px] text-gray-400 mb-1">If match</label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={criterion.score_if_match}
                  onChange={(e) => updateCriterion(i, { score_if_match: Number(e.target.value) })}
                  className="w-16 text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-indigo-300"
                />
              </div>

              {/* Score if no match */}
              <div>
                <label className="block text-[10px] text-gray-400 mb-1">If no match</label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={criterion.score_if_no_match}
                  onChange={(e) => updateCriterion(i, { score_if_no_match: Number(e.target.value) })}
                  className="w-16 text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-indigo-300"
                />
              </div>

              {/* Weight + remove */}
              <div className="flex items-end gap-1">
                <div>
                  <label className="block text-[10px] text-gray-400 mb-1">Weight %</label>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={criterion.weight}
                    onChange={(e) => updateCriterion(i, { weight: Number(e.target.value) })}
                    className="w-16 text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-indigo-300"
                  />
                </div>
                <button
                  onClick={() => removeCriterion(i)}
                  className="mb-0.5 p-1.5 text-gray-400 hover:text-red-500 transition-colors"
                  aria-label="Remove criterion"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add criterion */}
      {availableFields.length > criteria.length && (
        <button
          onClick={addCriterion}
          className="mb-4 text-xs text-gray-500 hover:text-gray-800 flex items-center gap-1 transition-colors"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          Add criterion
        </button>
      )}

      {/* Weight sum indicator */}
      {criteria.length > 0 && (
        <div className={`mb-4 flex items-center gap-2 text-xs px-3 py-2 rounded-lg border ${
          weightsValid
            ? 'text-green-700 bg-green-50 border-green-100'
            : 'text-amber-700 bg-amber-50 border-amber-100'
        }`}>
          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${weightsValid ? 'bg-green-500' : 'bg-amber-400'}`} />
          Weights total: <strong>{totalWeight}</strong> / 100
          {!weightsValid && ' — must equal 100 before scoring'}
        </div>
      )}

      {/* Score error */}
      {scoreError && (
        <p className="mb-4 text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
          {scoreError}
        </p>
      )}

      {/* Submit */}
      <button
        onClick={handleScore}
        disabled={scoring || criteria.length === 0 || !weightsValid}
        className="w-full py-2.5 text-sm font-semibold text-white bg-gray-900 rounded-xl hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        {scoring ? 'Scoring…' : 'Score contacts →'}
      </button>
    </div>
  )
}
