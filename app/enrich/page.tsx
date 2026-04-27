'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useSession, signIn } from 'next-auth/react'
import UploadForm, { type ConfirmedUpload } from '@/app/components/UploadForm'
import EnrichmentChoice from '../components/EnrichmentChoice'
import EnrichmentProgress from '../components/EnrichmentProgress'
import SavedModels from '../components/SavedModels'
import AppHeader from '../components/AppHeader'

export default function EnrichPage() {
  const router = useRouter()
  const { data: session, status } = useSession()
  const [stage, setStage] = useState<'upload' | 'choose' | 'enriching' | 'link-sent'>('upload')
  const [confirmed, setConfirmed] = useState<ConfirmedUpload | null>(null)
  const [notifyEmail, setNotifyEmail] = useState<string | null>(null)
  const [enrichError, setEnrichError] = useState<string | null>(null)
  const [selectedModel, setSelectedModel] = useState<{ id: string; name: string } | null>(null)
  const [scoring, setScoring] = useState(false)

  const userEmail = status === 'authenticated' ? session.user.email : null

  const handleEnrichError = (message: string) => {
    setEnrichError(message)
    setStage('upload')
    setConfirmed(null)
    setNotifyEmail(null)
    setSelectedModel(null)
  }

  const handleEnrichComplete = async (runId: string) => {
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

    if (notifyEmail && status !== 'authenticated') {
      try {
        document.cookie = `auth_next=${encodeURIComponent(`/run/${runId}/score`)}; path=/; max-age=600; SameSite=Lax`
        const result = await signIn('resend', {
          email:       notifyEmail,
          redirect:    false,
          callbackUrl: '/auth/confirmed',
        })
        if (!result?.error) {
          setStage('link-sent')
          return
        }
      } catch { /* fall through to normal redirect on error */ }
    }

    router.push(`/run/${runId}/score`)
  }

  const handleModelSelect = (model: { id: string; name: string }) => {
    setSelectedModel(model)
  }

  const clearModel = () => {
    setSelectedModel(null)
  }

  // -- Magic-link sent (non-logged-in notify-me flow) -------------------------
  if (stage === 'link-sent' && notifyEmail) {
    return (
      <main className="min-h-screen bg-gray-50">
        <AppHeader userEmail={null} />
        <div className="flex items-center justify-center px-4 py-24">
          <div className="w-full max-w-sm text-center">
            <div className="w-12 h-12 bg-green-50 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-6 h-6 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            </div>
            <h1 className="text-lg font-semibold text-gray-900 mb-1">Check your inbox</h1>
            <p className="text-sm text-gray-500">
              Enrichment complete! We sent a sign-in link to{' '}
              <span className="font-medium text-gray-700">{notifyEmail}</span>.
              Click it to score your contacts.
            </p>
            <p className="mt-4 text-xs text-gray-400">
              Didn&apos;t receive it?{' '}
              <button
                onClick={() => { setStage('upload'); setNotifyEmail(null); setConfirmed(null) }}
                className="text-blue-600 hover:underline"
              >
                Start over
              </button>
            </p>
          </div>
        </div>
      </main>
    )
  }

  // -- Pre-enrichment choice --------------------------------------------------
  if (stage === 'choose' && confirmed) {
    return (
      <main className="min-h-screen bg-gray-50">
        <AppHeader userEmail={userEmail} plan={session?.user?.plan ?? null} />
        <div className="flex items-center justify-center px-4 py-16">
          <div className="w-full max-w-lg">
            <EnrichmentChoice
              filename={confirmed.original_filename}
              onStartNow={() => setStage('enriching')}
              onNotifyMe={(email) => { setNotifyEmail(email); setStage('enriching') }}
              initialEmail={session?.user?.email ?? undefined}
            />
          </div>
        </div>
      </main>
    )
  }

  // -- Enrichment in progress -------------------------------------------------
  if (stage === 'enriching' && confirmed) {
    return (
      <main className="min-h-screen bg-gray-50">
        <AppHeader userEmail={userEmail} plan={session?.user?.plan ?? null} />
        <div className="flex items-center justify-center px-4 py-16">
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
        </div>
      </main>
    )
  }

  // -- Upload flow ------------------------------------------------------------
  return (
    <main className="min-h-screen bg-gray-50">
      <AppHeader userEmail={userEmail} plan={session?.user?.plan ?? null} />

      <div className="max-w-3xl mx-auto px-4 py-12">

        {enrichError && (
          <div className="mb-6">
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

        {selectedModel && (
          <div className="mb-6">
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

        <UploadForm onConfirmed={(data) => { setConfirmed(data); setStage('choose') }} />

        <SavedModels onSelect={handleModelSelect} />
      </div>
    </main>
  )
}
