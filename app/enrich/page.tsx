'use client'

import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import UploadForm, { type ConfirmedUpload } from '@/app/components/UploadForm'
import EnrichmentConfirm from '../components/EnrichmentChoice'
import EnrichmentSubmitted from '../components/EnrichmentProgress'
import SavedModels from '../components/SavedModels'
import AppHeader from '../components/AppHeader'
import UpgradeModal from '../components/UpgradeModal'

export default function EnrichPage() {
  const { data: session, status } = useSession()
  const [stage, setStage] = useState<'upload' | 'confirm' | 'submitted'>('upload')
  const [confirmed, setConfirmed] = useState<ConfirmedUpload | null>(null)
  const [submittedEmail, setSubmittedEmail] = useState<string | null>(null)
  const [enrichError, setEnrichError] = useState<string | null>(null)
  const [showRunLimit, setShowRunLimit] = useState(false)
  const [selectedModel, setSelectedModel] = useState<{ id: string; name: string } | null>(null)
  const [storedCompanyUrl, setStoredCompanyUrl] = useState<string | null>(null)
  const [enrichmentName, setEnrichmentName] = useState(() => {
    const now = new Date()
    return `Data enrichment - ${now.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}`
  })

  const userEmail = status === 'authenticated' ? session.user.email : null

  useEffect(() => {
    if (status !== 'authenticated') return
    fetch('/api/org')
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (data?.companyLinkedInUrl) setStoredCompanyUrl(data.companyLinkedInUrl)
      })
      .catch(() => {})
  }, [status])

  const handleSubmit = async (email: string, companyLinkedInUrl: string | null) => {
    if (!confirmed) return

    try {
      const res = await fetch('/api/enrich', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          blob_url:             confirmed.blob_url,
          linkedin_column:      confirmed.linkedin_column,
          original_filename:    confirmed.original_filename,
          notify_email:         email,
          name:                 enrichmentName,
          company_linkedin_url: companyLinkedInUrl ?? undefined,
          ...(selectedModel ? { model_id: selectedModel.id } : {}),
        }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        if (res.status === 402 && data.error === 'run_limit_reached') {
          setShowRunLimit(true)
          return
        }
        setEnrichError(data.error ?? `Something went wrong (${res.status}). Please try again.`)
        return
      }

      setSubmittedEmail(email)
      setStage('submitted')
    } catch {
      setEnrichError('Network error. Please try again.')
    }
  }

  const resetToUpload = () => {
    setStage('upload')
    setConfirmed(null)
    setSubmittedEmail(null)
    setEnrichError(null)
    setSelectedModel(null)
    setShowRunLimit(false)
    setEnrichmentName(() => {
      const now = new Date()
      return `Data enrichment - ${now.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}`
    })
  }

  // -- Enrichment submitted ---------------------------------------------------
  if (stage === 'submitted' && submittedEmail) {
    return (
      <main className="min-h-screen bg-gray-50">
        <AppHeader userEmail={userEmail} plan={session?.user?.plan ?? null} orgName={session?.user?.orgName ?? null} role={session?.user?.role ?? null} />
        <div className="flex items-center justify-center px-4 py-24">
          <EnrichmentSubmitted
            notifyEmail={submittedEmail}
            onStartAnother={resetToUpload}
          />
        </div>
      </main>
    )
  }

  // -- Confirm screen --------------------------------------------------------
  if (stage === 'confirm' && confirmed) {
    return (
      <main className="min-h-screen bg-gray-50">
        <AppHeader userEmail={userEmail} plan={session?.user?.plan ?? null} orgName={session?.user?.orgName ?? null} role={session?.user?.role ?? null} />
        <div className="flex items-center justify-center px-4 py-16">
          <div className="w-full max-w-lg">
            {enrichError && (
              <div className="mb-4 flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-xl">
                <svg className="w-4 h-4 text-red-500 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                </svg>
                <p className="text-sm text-red-700 flex-1">{enrichError}</p>
                <button onClick={() => setEnrichError(null)} className="text-red-400 hover:text-red-600">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            )}
            <EnrichmentConfirm
              filename={confirmed.original_filename}
              initialEmail={userEmail ?? undefined}
              onSubmit={handleSubmit}
              plan={(session?.user?.plan ?? 'free') as 'free' | 'starter' | 'pro' | 'enterprise'}
              storedCompanyUrl={storedCompanyUrl}
            />
          </div>
        </div>
        {showRunLimit && (
          <UpgradeModal
            trigger="You've used all 5 free enrichments"
            requiredPlan="starter"
            isOpen
            onClose={() => setShowRunLimit(false)}
            currentPlan={(session?.user?.plan ?? 'free') as 'free' | 'starter' | 'pro' | 'enterprise'}
          />
        )}
      </main>
    )
  }

  // -- Upload flow -----------------------------------------------------------
  return (
    <main className="min-h-screen bg-gray-50">
      <AppHeader userEmail={userEmail} plan={session?.user?.plan ?? null} />

      <div className="max-w-3xl mx-auto px-4 py-12">

        <div className="mb-8">
          <h1 className="text-lg font-semibold text-gray-900 mb-1">New enrichment</h1>
          <p className="text-sm text-gray-500 mb-5">Upload a CSV of LinkedIn profiles to enrich and score your contacts.</p>
          <label className="block text-xs font-medium text-gray-600 mb-1.5" htmlFor="enrichment-name">
            Enrichment name
          </label>
          <input
            id="enrichment-name"
            type="text"
            value={enrichmentName}
            onChange={(e) => setEnrichmentName(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 bg-white"
          />
        </div>

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
                onClick={() => setSelectedModel(null)}
                className="shrink-0 text-xs text-blue-500 hover:text-blue-700 font-medium transition-colors"
              >
                Clear
              </button>
            </div>
          </div>
        )}

        <UploadForm onConfirmed={(data) => { setConfirmed(data); setStage('confirm') }} />

        <SavedModels onSelect={(model) => setSelectedModel(model)} />
      </div>
    </main>
  )
}
