'use client'

import { useState } from 'react'
import UploadForm, { type ConfirmedUpload } from '@/app/components/UploadForm'

// ---------------------------------------------------------------------------
// HomePage
//
// Root page of ScoreStack. Manages the top-level flow between upload (Phase 2)
// and enrichment (Phase 3).
//
// Phase 2 scope:
//   - Renders <UploadForm /> which handles file selection, upload to /api/upload,
//     column preview, and LinkedIn column confirmation.
//   - On confirmation, stores the result in `confirmed` state and shows a
//     placeholder that Phase 3 replaces with <EnrichmentProgress />.
//
// Phase 3 change required:
//   - Replace the "confirmed" placeholder block with:
//       <EnrichmentProgress
//         blobUrl={confirmed.blob_url}
//         linkedinColumn={confirmed.linkedin_column}
//         originalFilename={confirmed.original_filename}
//         onComplete={(runId) => router.push(`/run/${runId}/score`)}
//       />
//
// Phase 6 change required:
//   - Uncomment / complete the <SavedModels /> section below the upload form.
// ---------------------------------------------------------------------------

export default function HomePage() {
  const [confirmed, setConfirmed] = useState<ConfirmedUpload | null>(null)

  // ── Post-confirmation state ────────────────────────────────────────────────
  // Phase 3 replaces this block with <EnrichmentProgress />.
  if (confirmed) {
    return (
      <main className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8 max-w-sm w-full text-center">
          <div className="w-9 h-9 border-[3px] border-blue-500 border-t-transparent rounded-full animate-spin mx-auto" />

          <h2 className="mt-5 text-sm font-semibold text-gray-800">
            Ready to enrich contacts
          </h2>
          <p className="mt-1 text-xs text-gray-500">
            <span className="font-medium">{confirmed.original_filename}</span>
            {' · '}
            LinkedIn column:{' '}
            <span className="font-mono bg-gray-100 px-1 py-0.5 rounded">
              {confirmed.linkedin_column}
            </span>
          </p>

          {/* Phase 3: mount <EnrichmentProgress /> here */}
          <p className="mt-6 text-xs text-gray-300 italic">
            EnrichmentProgress mounts here in Phase 3
          </p>

          <button
            onClick={() => setConfirmed(null)}
            className="mt-6 text-xs text-gray-400 hover:text-gray-600 transition-colors"
          >
            ← Start over
          </button>
        </div>
      </main>
    )
  }

  // ── Upload flow ────────────────────────────────────────────────────────────
  return (
    <main className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-4 py-16 sm:py-24">

        {/* Hero */}
        <header className="mb-12 text-center">
          <div className="inline-flex items-center gap-2 mb-6">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
              <svg
                className="w-4 h-4 text-white"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M3 7.5L7.5 3m0 0L12 7.5M7.5 3v13.5m13.5 0L16.5 21m0 0L12 16.5m4.5 4.5V7.5"
                />
              </svg>
            </div>
            <span className="text-xl font-bold tracking-tight text-gray-900">ScoreStack</span>
          </div>

          <h1 className="text-4xl sm:text-5xl font-bold tracking-tight text-gray-900 leading-tight">
            Rank your contact list{' '}
            <span className="text-blue-600">with LinkedIn data</span>
          </h1>
          <p className="mt-4 text-lg text-gray-500 max-w-xl mx-auto leading-relaxed">
            Upload a CSV, define what a good contact looks like, and get a scored,
            ranked list in minutes — no manual research required.
          </p>
        </header>

        {/* Upload card */}
        <div className="max-w-3xl mx-auto">
          <UploadForm onConfirmed={setConfirmed} />

          {/* How it works — subtle guidance */}
          <div className="mt-8 grid grid-cols-3 gap-4 text-center">
            {[
              { step: '1', label: 'Upload CSV', sub: 'With LinkedIn URLs' },
              { step: '2', label: 'Define criteria', sub: 'Titles, seniority, industry' },
              { step: '3', label: 'Get ranked list', sub: 'Scored by fit' },
            ].map(({ step, label, sub }) => (
              <div key={step} className="flex flex-col items-center gap-1.5">
                <div className="w-7 h-7 rounded-full bg-gray-100 text-gray-400 text-xs font-semibold flex items-center justify-center">
                  {step}
                </div>
                <p className="text-xs font-medium text-gray-600">{label}</p>
                <p className="text-xs text-gray-400">{sub}</p>
              </div>
            ))}
          </div>

          {/* Phase 6: Saved models section ──────────────────────────────────
           * Replace this placeholder with:
           *   <SavedModels onSelect={(model) => { ... }} />
           * which fetches GET /api/models and lets the user pick a model
           * to re-run on a freshly uploaded CSV.
           * ──────────────────────────────────────────────────────────────── */}
          <div className="mt-10 text-center">
            <p className="text-xs text-gray-300">
              Re-run a saved model · available in Phase 6
            </p>
          </div>
        </div>
      </div>
    </main>
  )
}
