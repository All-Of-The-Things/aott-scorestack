'use client'

import { useState } from 'react'
import type { Criterion } from '@/app//lib/scoring'
import SaveModelModal from '@/app/components/SaveModelModal'

interface SaveModelButtonProps {
  criteria: Criterion[]
  savedModelName: string | null
}

export default function SaveModelButton({ criteria, savedModelName }: SaveModelButtonProps) {
  const [showModal, setShowModal] = useState(false)
  const [modelName, setModelName] = useState<string | null>(savedModelName)

  const handleSaved = (_modelId: string, name: string) => {
    setShowModal(false)
    setModelName(name)
  }

  if (modelName) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-green-700 bg-green-50 border border-green-100 px-2.5 py-1 rounded-full">
        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
        </svg>
        Saved as {modelName}
      </span>
    )
  }

  return (
    <>
      <button
        onClick={() => setShowModal(true)}
        className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-700 bg-blue-50 border border-blue-100 px-2.5 py-1 rounded-full hover:bg-blue-100 transition-colors cursor-pointer"
      >
        Save as model
      </button>

      {showModal && (
        <SaveModelModal
          criteria={criteria}
          onClose={() => setShowModal(false)}
          onSaved={handleSaved}
        />
      )}
    </>
  )
}
