'use client'

import { useState, useEffect } from 'react'

interface ModelSummary {
  id: string
  name: string
  created_at: string
  criteria_count: number
  criteria_summary: { field: string; weight: number }[]
}

interface SavedModelsProps {
  onSelect: (model: { id: string; name: string }) => void
}

const FIELD_LABELS: Record<string, string> = {
  current_title: 'Current Title',
  seniority: 'Seniority',
  company_name: 'Company',
  industry: 'Industry',
  company_size: 'Company Size',
  location: 'Location',
}

export default function SavedModels({ onSelect }: SavedModelsProps) {
  const [models, setModels] = useState<ModelSummary[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/models')
      .then((res) => (res.ok ? res.json() : { models: [] }))
      .then((data) => setModels(data.models ?? []))
      .catch(() => setModels([]))
      .finally(() => setLoading(false))
  }, [])

  if (loading || models.length === 0) return null

  return (
    <div className="mt-10">
      {/* Section divider */}
      <div className="flex items-center gap-3 mb-4">
        <div className="flex-1 h-px bg-gray-200" />
        <span className="text-xs font-medium text-gray-400 uppercase tracking-wide">
          Or re-run a saved model
        </span>
        <div className="flex-1 h-px bg-gray-200" />
      </div>

      {/* Model cards */}
      <div className="grid gap-3">
        {models.map((model) => (
          <button
            key={model.id}
            onClick={() => onSelect({ id: model.id, name: model.name })}
            className="w-full text-left bg-white rounded-xl border border-gray-200 p-4 hover:border-blue-300 hover:shadow-sm transition-all group"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-800 group-hover:text-blue-700 transition-colors truncate">
                  {model.name}
                </p>
                <p className="mt-0.5 text-[10px] text-gray-400">
                  {model.criteria_count} criteria &middot;{' '}
                  {new Date(model.created_at).toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  })}
                </p>
              </div>
              <svg
                className="w-4 h-4 text-gray-300 group-hover:text-blue-500 shrink-0 mt-0.5 transition-colors"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
              </svg>
            </div>

            {/* Criteria pills */}
            {model.criteria_summary.length > 0 && (
              <div className="flex items-center gap-1.5 flex-wrap mt-2">
                {model.criteria_summary.map((c) => (
                  <span
                    key={c.field}
                    className="text-[10px] text-gray-500 bg-gray-100 border border-gray-200 px-2 py-0.5 rounded-full"
                  >
                    {FIELD_LABELS[c.field] ?? c.field} ({c.weight}%)
                  </span>
                ))}
              </div>
            )}
          </button>
        ))}
      </div>
    </div>
  )
}
