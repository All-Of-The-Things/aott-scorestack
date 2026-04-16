'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import Link from 'next/link'
import UploadForm, { type ConfirmedUpload } from '@/app/components/UploadForm'
import EnrichmentChoice from './components/EnrichmentChoice'
import EnrichmentProgress from './components/EnrichmentProgress'
import SavedModels from './components/SavedModels'

export default function HomePage() {
  const router = useRouter()
  const { data: session, status } = useSession()
  // stage controls which screen is shown after upload
  const [stage, setStage] = useState<'upload' | 'choose' | 'enriching'>('upload')
  const [confirmed, setConfirmed] = useState<ConfirmedUpload | null>(null)
  const [notifyEmail, setNotifyEmail] = useState<string | null>(null)
  const [enrichError, setEnrichError] = useState<string | null>(null)
  const [selectedModel, setSelectedModel] = useState<{ id: string; name: string } | null>(null)
  const [scoring, setScoring] = useState(false)

  const handleEnrichError = (message: string) => {
    setEnrichError(message)
    setStage('upload')
    setConfirmed(null)
    setNotifyEmail(null)
    setSelectedModel(null)
  }

  const handleEnrichComplete = async (runId: string) => {
    // If a saved model is selected, skip CriteriaBuilder and score directly
    if (selectedModel) {
      setScoring(true)
      try {
        const res = await fetch('/api/score', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ run_id: runId, model_id: selectedModel.id }),
        })

        if (!res.ok) {
          const data = await res.json()
          handleEnrichError(data.error ?? `Scoring failed (${res.status})`)
          return
        }

        router.push(`/run/${runId}/results`)
      } catch {
        handleEnrichError('Network error — could not score contacts')
      }
      return
    }

    // Normal flow: go to CriteriaBuilder
    router.push(`/run/${runId}/score`)
  }

  const handleModelSelect = (model: { id: string; name: string }) => {
    setSelectedModel(model)
  }

  const clearModel = () => {
    setSelectedModel(null)
  }

  // -- Pre-enrichment choice --------------------------------------------------
  if (stage === 'choose' && confirmed) {
    return (
      <main className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="w-full max-w-lg">
          <EnrichmentChoice
            filename={confirmed.original_filename}
            onStartNow={() => setStage('enriching')}
            onNotifyMe={(email) => { setNotifyEmail(email); setStage('enriching') }}
            initialEmail={session?.user?.email ?? undefined}
          />
        </div>
      </main>
    )
  }

  // -- Enrichment in progress -------------------------------------------------
  if (stage === 'enriching' && confirmed) {
    return (
      <main className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="w-full max-w-md">
          <EnrichmentProgress
            blobUrl={confirmed.blob_url}
            linkedinColumn={confirmed.linkedin_column}
            originalFilename={confirmed.original_filename}
            notifyEmail={notifyEmail ?? undefined}
            onComplete={handleEnrichComplete}
            onError={handleEnrichError}
          />
          {scoring && (
            <div className="mt-4 text-center">
              <div className="w-6 h-6 border-2 border-gray-300 border-t-blue-600 rounded-full animate-spin mx-auto mb-2" />
              <p className="text-xs text-gray-500">
                Scoring with <span className="font-medium text-gray-700">{selectedModel?.name}</span>...
              </p>
            </div>
          )}
        </div>
      </main>
    )
  }

  // -- Upload flow ------------------------------------------------------------
  return (
    <main className="min-h-screen bg-gray-50">
      {/* Top nav — shows user email + sign out, or sign-in link */}
      <nav className="border-b border-gray-100 bg-white">
        <div className="max-w-4xl mx-auto px-4 h-12 flex items-center justify-between">
          <span className="text-sm font-semibold text-gray-800">ScoreStack</span>
          <div className="text-sm text-gray-500">
            {status === 'authenticated' ? (
              <span>{session.user.email}</span>
            ) : (
              <Link
                href="/auth/signin"
                className="text-blue-600 hover:underline font-medium"
              >
                Sign in
              </Link>
            )}
          </div>
        </div>
      </nav>

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

        {/* Enrichment error banner */}
        {enrichError && (
          <div className="max-w-3xl mx-auto mb-6">
            <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-xl">
              <svg className="w-4 h-4 text-red-500 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
              </svg>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-red-700">Enrichment failed</p>
                <p className="text-xs text-red-600 mt-0.5">{enrichError}</p>
              </div>
              <button
                onClick={() => setEnrichError(null)}
                className="shrink-0 text-red-400 hover:text-red-600 transition-colors"
                aria-label="Dismiss"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
        )}

        {/* Selected model banner */}
        {selectedModel && (
          <div className="max-w-3xl mx-auto mb-6">
            <div className="flex items-center justify-between gap-3 p-3 bg-blue-50 border border-blue-200 rounded-xl">
              <div className="flex items-center gap-2 min-w-0">
                <svg className="w-4 h-4 text-blue-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="text-xs text-blue-700">
                  Re-running with <span className="font-medium">{selectedModel.name}</span> — upload a CSV to score it automatically
                </p>
              </div>
              <button
                onClick={clearModel}
                className="shrink-0 text-xs text-blue-500 hover:text-blue-700 font-medium transition-colors"
              >
                Clear
              </button>
            </div>
          </div>
        )}

        {/* Upload card */}
        <div className="max-w-3xl mx-auto">
          <UploadForm onConfirmed={(data) => { setConfirmed(data); setStage('choose') }} />

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

          {/* Saved models section */}
          <SavedModels onSelect={handleModelSelect} />
        </div>
      </div>
    </main>
  )
}
