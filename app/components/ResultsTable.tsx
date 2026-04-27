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
  enrichedData: Record<string, unknown> | null
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

const PROFILE_FIELDS = [
  'current_title',
  'seniority',
  'company_name',
  'industry',
  'company_size',
  'location',
] as const

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

function EnrichedProfile({ data }: { data: Record<string, unknown> | null }) {
  if (!data) return null
  const fields = PROFILE_FIELDS.filter((f) => data[f] !== null && data[f] !== undefined)
  if (fields.length === 0) return null

  return (
    <div className="mb-4">
      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-2">LinkedIn profile</p>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-1.5">
        {fields.map((f) => (
          <div key={f} className="flex flex-col">
            <span className="text-[10px] text-gray-400">{FIELD_LABELS[f]}</span>
            <span className="text-xs text-gray-700 font-medium truncate">{String(data[f])}</span>
          </div>
        ))}
      </div>
    </div>
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
// PaginationBar — shared by top and bottom placements
// ---------------------------------------------------------------------------

interface PaginationBarProps {
  page: number
  pageSize: number
  totalPages: number
  start: number
  total: number
  onPageChange: (p: number) => void
  onPageSizeChange: (s: number) => void
}

function PaginationBar({ page, pageSize, totalPages, start, total, onPageChange, onPageSizeChange }: PaginationBarProps) {
  return (
    <div className="px-6 py-3 flex items-center justify-between gap-4">
      <div className="flex items-center gap-2 text-xs text-gray-500">
        <span>Rows per page</span>
        {[25, 50, 100].map((size) => (
          <button
            key={size}
            onClick={() => onPageSizeChange(size)}
            className={`px-2 py-1 rounded-md font-medium transition-colors ${
              pageSize === size ? 'bg-gray-900 text-white' : 'hover:bg-gray-100'
            }`}
          >
            {size}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-3 text-xs text-gray-500">
        <span>{start + 1}–{Math.min(start + pageSize, total)} of {total}</span>
        <button
          onClick={() => onPageChange(Math.max(1, page - 1))}
          disabled={page === 1}
          className="p-1.5 rounded-md hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          aria-label="Previous page"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
          </svg>
        </button>
        <button
          onClick={() => onPageChange(Math.min(totalPages, page + 1))}
          disabled={page === totalPages}
          className="p-1.5 rounded-md hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          aria-label="Next page"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
          </svg>
        </button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// ResultsTable
// ---------------------------------------------------------------------------

interface ResultsTableProps {
  results: SerializedResult[]
  criteria: CriterionMeta[]
  defaultPageSize: number
  shouldBlurContent: boolean
}

export default function ResultsTable({ results, criteria, defaultPageSize, shouldBlurContent }: ResultsTableProps) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [page, setPage]         = useState(1)
  const [pageSize, setPageSize] = useState(defaultPageSize)

  function handlePageSizeChange(size: number) {
    setPageSize(size)
    setPage(1)
  }

  const totalPages  = Math.max(1, Math.ceil(results.length / pageSize))
  const start       = (page - 1) * pageSize
  const pageResults = results.slice(start, start + pageSize)

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

  const paginationProps = {
    page, pageSize, totalPages, start, total: results.length,
    onPageChange: setPage,
    onPageSizeChange: handlePageSizeChange,
  }

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

      {/* Pagination — top */}
      {results.length > pageSize && (
        <div className="border-b border-gray-100">
          <PaginationBar {...paginationProps} />
        </div>
      )}

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
            {pageResults.map((result) => (
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
                      <div className="relative">
                        <div className={shouldBlurContent ? 'blur-sm select-none pointer-events-none' : ''}>
                          <EnrichedProfile data={result.enrichedData} />
                          <CriterionBreakdown scores={result.criterionScores} />
                        </div>
                        {shouldBlurContent && (
                          <div className="absolute inset-0 flex items-center justify-center">
                            <a
                              href="/settings/billing"
                              className="inline-flex items-center gap-1.5 px-3 py-2 bg-white border border-gray-200 rounded-lg shadow-sm text-xs font-medium text-blue-600 hover:text-blue-700 hover:border-blue-200 transition-colors"
                            >
                              <svg className="w-3.5 h-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
                              </svg>
                              Upgrade to unlock enrichment details
                            </a>
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination — bottom */}
      {results.length > pageSize && (
        <div className="border-t border-gray-100">
          <PaginationBar {...paginationProps} />
        </div>
      )}
    </div>
  )
}
