'use client'

import { useState, useEffect, useCallback } from 'react'
import type { Criterion } from '@/app/lib/scoring'

interface SaveModelModalProps {
  criteria: Criterion[]
  onClose: () => void
  onSaved: (modelId: string, modelName: string) => void
}

export default function SaveModelModal({ criteria, onClose, onSaved }: SaveModelModalProps) {
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSave = useCallback(async () => {
    if (!name.trim() || saving) return

    setSaving(true)
    setError(null)

    try {
      const res = await fetch('/api/models', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), criteria }),
      })

      if (!res.ok) {
        const data = await res.json()
        setError(data.error ?? `Save failed (${res.status})`)
        setSaving(false)
        return
      }

      const { model_id } = await res.json()
      onSaved(model_id, name.trim())
    } catch {
      setError('Network error — could not save model')
      setSaving(false)
    }
  }, [name, saving, criteria, onSaved])

  // Escape key closes modal
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-sm border border-gray-200 w-full max-w-sm mx-4 p-6"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-gray-800">Save scoring model</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
            aria-label="Close"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Name input */}
        <label className="block mb-1 text-xs text-gray-500">Model name</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={100}
          placeholder="e.g. Enterprise SaaS Fit"
          autoFocus
          className="w-full text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder:text-gray-300"
        />
        <p className="mt-1 text-[10px] text-gray-300">
          {criteria.length} criteria &middot; weights sum to 100
        </p>

        {/* Error */}
        {error && (
          <div className="mt-3 p-2.5 bg-red-50 border border-red-100 rounded-lg">
            <p className="text-xs text-red-600">{error}</p>
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center justify-end gap-2 mt-5">
          <button
            onClick={onClose}
            className="text-xs text-gray-500 hover:text-gray-700 px-3 py-1.5 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!name.trim() || saving}
            className="text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed px-4 py-1.5 rounded-lg transition-colors"
          >
            {saving ? 'Saving...' : 'Save model'}
          </button>
        </div>
      </div>
    </div>
  )
}
