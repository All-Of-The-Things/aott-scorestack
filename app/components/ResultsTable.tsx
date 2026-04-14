'use client'

import React, { useState } from 'react'
import type { CriterionScore } from '@/app/lib/scoring'

// ---------------------------------------------------------------------------
// Shared types — exported so the parent Server Component can import them
// ---------------------------------------------------------------------------

export interface SerializedResult {
  id: string
  rank: number
  linkedinUrl: string
  enrichmentStatus: 'success' | 'failed' | 'skipped'
  totalScore: number           // Decimal already converted to number by server page
  criterionScores: CriterionScore[]
}

export interface CriterionMeta {
  field: string
  weight: number
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const FIELD_LABELS: Record<string, string> = {
  current_title: 'Current Title',
  seniority: 'Seniority',
  company_name: 'Company',
  industry: 'Industry',
  company_size: 'Company Size',
  location: 'Location',
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function StatusBadge({ status }: { status: SerializedResult['enrichmentStatus'] }) {
  if (status === 'success') {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-medium text-green-700 bg-green-50 border border-green-100 px-1.5 py-0.5 rounded-full">
        <span className="w-1 h-1 rounded-full bg-green-500" />
        Enriched
      </span>
    )
  }
  if (status === 'failed') {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-medium text-red-600 bg-red-50 border border-red-100 px-1.5 py-0.5 rounded-full">
        <span className="w-1 h-1 rounded-full bg-red-400" />
        Failed
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-medium text-gray-500 bg-gray-100 border border-gray-200 px-1.5 py-0.5 rounded-full">
      <span className="w-1 h-1 rounded-full bg-gray-400" />
      Skipped
    </span>
  )
}

function ScoreBar({ score }: { score: number }) {
  const color =
    score >= 70 ? 'bg-green-500' :
    score >= 40 ? 'bg-amber-400' :
    'bg-red-400'

  return (
    <div className="flex items-center gap-2">
      <div className="w-20 h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full ${color}`}
          style={{ width: `${Math.min(score, 100)}%` }}
        />
      </div>
      <span className="tabular-nums font-medium text-gray-700">{score.toFixed(1)}</span>
    </div>
  )
}

function MatchedBadge({ matched }: { matched: boolean }) {
  return matched ? (
    <span className="text-[10px] font-medium text-green-700 bg-green-50 border border-green-100 px-1.5 py-0.5 rounded">✓ Match</span>
  ) : (
    <span className="text-[10px] font-medium text-gray-500 bg-gray-100 border border-gray-200 px-1.5 py-0.5 rounded">✗ No match</span>
  )
}

function CriterionBreakdown({ scores }: { scores: CriterionScore[] }) {
  if (scores.length === 0) {
    return (
      <p className="text-xs text-gray-400 italic">
        Contact was not enriched — no criterion breakdown available.
      </p>
    )
  }

  return (
    <div className="grid gap-2">
      {scores.map((cs) => (
        <div
          key={cs.field}
          className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-x-4 items-center text-xs"
        >
          <div>
            <span className="font-medium text-gray-700">
              {FIELD_LABELS[cs.field] ?? cs.field}
            </span>
            <span className="ml-2 text-gray-400 font-mono text-[10px]">
              {cs.raw_value ?? '—'}
            </span>
          </div>
          <MatchedBadge matched={cs.matched} />
          <span className="text-gray-500 tabular-nums">
            score: <strong>{cs.score}</strong>
          </span>
          <span className="text-gray-400 tabular-nums">
            weight: {cs.weight}%
          </span>
          <span className="text-gray-700 font-medium tabular-nums">
            +{cs.weighted_contribution.toFixed(2)} pts
          </span>
        </div>
      ))}
    </div>
  )
}

function Chevron({ expanded }: { expanded: boolean }) {
  return (
    <svg
      className={`w-3.5 h-3.5 text-gray-400 transition-transform ${expanded ? 'rotate-180' : ''}`}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
    </svg>
  )
}

// ---------------------------------------------------------------------------
// ResultsTable
// ---------------------------------------------------------------------------

interface ResultsTableProps {
  results: SerializedResult[]
  criteria: CriterionMeta[]
}

export default function ResultsTable({ results, criteria }: ResultsTableProps) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev)

      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }

      return next
    })
  }

  // colSpan for detail row: rank + url + status + score + chevron = 5 fixed cols
  const detailColSpan = 5

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
      {/* Card header */}
      <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-gray-800">Ranked results</h2>
          <p className="mt-0.5 text-xs text-gray-400">
            {results.length} contacts · sorted by score descending
          </p>
        </div>
        {criteria.length > 0 && (
          <div className="flex items-center gap-1.5 flex-wrap justify-end max-w-xs">
            {criteria.map((c) => (
              <span
                key={c.field}
                className="text-[10px] text-gray-500 bg-gray-100 border border-gray-200 px-2 py-0.5 rounded-full"
              >
                {FIELD_LABELS[c.field] ?? c.field} ({c.weight}%)
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-100 text-left text-gray-400 font-medium">
              <th className="pl-6 pr-3 py-3 w-10">#</th>
              <th className="px-3 py-3">LinkedIn</th>
              <th className="px-3 py-3 w-24">Status</th>
              <th className="px-3 py-3 w-36">Score</th>
              <th className="pl-3 pr-6 py-3 w-8" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {results.map((result) => (
              <React.Fragment key={result.id}>
                {/* Main row */}
                <tr
                  onClick={() => toggle(result.id)}
                  className="cursor-pointer hover:bg-gray-50 transition-colors"
                >
                  <td className="pl-6 pr-3 py-3 tabular-nums text-gray-400 font-medium">
                    {result.rank}
                  </td>
                  <td className="px-3 py-3 max-w-[240px]">
                    <a
                      href={result.linkedinUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="text-blue-600 hover:underline truncate block"
                    >
                      {result.linkedinUrl.replace(/^https?:\/\/(www\.)?linkedin\.com\/in\//, '')}
                    </a>
                  </td>
                  <td className="px-3 py-3">
                    <StatusBadge status={result.enrichmentStatus} />
                  </td>
                  <td className="px-3 py-3">
                    {result.enrichmentStatus === 'success' ? (
                      <ScoreBar score={result.totalScore} />
                    ) : (
                      <span className="text-gray-300 text-[10px] italic">Not enriched</span>
                    )}
                  </td>
                  <td className="pl-3 pr-6 py-3 text-right">
                    <Chevron expanded={expanded.has(result.id)} />
                  </td>
                </tr>

                {/* Expandable detail row */}
                {expanded.has(result.id) && (
                  <tr className="bg-gray-50">
                    <td colSpan={detailColSpan} className="pl-16 pr-6 py-4">
                      <CriterionBreakdown scores={result.criterionScores} />
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
