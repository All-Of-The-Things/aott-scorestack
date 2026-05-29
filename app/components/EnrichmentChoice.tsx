'use client'

import { useState } from 'react'
import type { Plan } from '@/app/generated/prisma'
import UpgradeModal from './UpgradeModal'

interface EnrichmentConfirmProps {
  filename: string
  onSubmit: (email: string, companyLinkedInUrl: string | null) => Promise<void>
  initialEmail?: string
  plan: Plan
  storedCompanyUrl?: string | null
}

function isValidCompanyUrl(url: string): boolean {
  return url.includes('linkedin.com/company/')
}

export default function EnrichmentConfirm({
  filename,
  onSubmit,
  initialEmail,
  plan,
  storedCompanyUrl,
}: EnrichmentConfirmProps) {
  const [email, setEmail] = useState(initialEmail ?? '')
  const [companyUrl, setCompanyUrl] = useState(storedCompanyUrl ?? '')
  const [submitting, setSubmitting] = useState(false)
  const [showUpgrade, setShowUpgrade] = useState(false)

  const isFree = plan === 'free'
  const urlError =
    companyUrl.trim() !== '' && !isValidCompanyUrl(companyUrl.trim())
      ? 'Enter a LinkedIn company page URL (linkedin.com/company/…)'
      : null
  const canSubmit =
    email.trim() !== '' && !submitting && !urlError

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!canSubmit) return
    setSubmitting(true)
    const resolvedUrl = companyUrl.trim() && isValidCompanyUrl(companyUrl.trim())
      ? companyUrl.trim()
      : null
    await onSubmit(email.trim(), resolvedUrl)
    setSubmitting(false)
  }

  return (
    <>
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden max-w-lg w-full mx-auto">
        <div className="px-6 py-4 border-b border-gray-100">
          <p className="text-sm font-semibold text-gray-800 truncate">{filename}</p>
          <p className="text-xs text-gray-400 mt-0.5">Ready to enrich</p>
        </div>

        <form onSubmit={handleSubmit} className="p-6 flex flex-col gap-5">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5" htmlFor="notify-email">
              Notify me when done
            </label>
            <input
              id="notify-email"
              type="email"
              required
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={submitting}
              className="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 disabled:opacity-50"
            />
            <p className="mt-1.5 text-xs text-gray-400">
              We&apos;ll email you a link when results are ready.
            </p>
          </div>

          {/* Company URL — Starter+ */}
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <label
                className={[
                  'block text-xs font-medium',
                  isFree ? 'text-gray-400' : 'text-gray-600',
                ].join(' ')}
                htmlFor="company-url"
              >
                Your company LinkedIn page
              </label>
              <span className="text-[10px] font-medium text-blue-600 bg-blue-50 border border-blue-100 px-1.5 py-0.5 rounded">
                Starter+
              </span>
              <span className="text-[10px] text-gray-400">(optional)</span>
            </div>

            <div className="relative">
              <input
                id="company-url"
                type="url"
                placeholder="https://linkedin.com/company/your-company"
                value={companyUrl}
                onChange={(e) => !isFree && setCompanyUrl(e.target.value)}
                onClick={() => isFree && setShowUpgrade(true)}
                disabled={submitting}
                readOnly={isFree}
                className={[
                  'w-full text-sm px-3 py-2 border rounded-lg bg-white focus:outline-none transition-shadow',
                  isFree
                    ? 'border-gray-100 text-gray-400 cursor-pointer bg-gray-50/60'
                    : urlError
                    ? 'border-red-300 focus:ring-2 focus:ring-red-500/20 focus:border-red-400'
                    : 'border-gray-200 focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400',
                  'disabled:opacity-50',
                ].join(' ')}
              />
              {isFree && (
                <button
                  type="button"
                  onClick={() => setShowUpgrade(true)}
                  className="absolute inset-0 w-full h-full rounded-lg"
                  aria-label="Upgrade to use company context"
                />
              )}
              {companyUrl && !isFree && (
                <button
                  type="button"
                  onClick={() => setCompanyUrl('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                  aria-label="Clear company URL"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>

            {urlError && (
              <p className="mt-1.5 text-xs text-red-600">{urlError}</p>
            )}
            {!urlError && (
              <p className={['mt-1.5 text-xs', isFree ? 'text-gray-400' : 'text-gray-400'].join(' ')}>
                Tailors scoring suggestions and AI messages to your business.
              </p>
            )}
          </div>

          <button
            type="submit"
            disabled={!canSubmit}
            className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
          >
            {submitting ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Starting…
              </>
            ) : (
              'Start enrichment →'
            )}
          </button>
        </form>
      </div>

      {showUpgrade && (
        <UpgradeModal
          trigger="Company context"
          requiredPlan="starter"
          isOpen
          onClose={() => setShowUpgrade(false)}
          currentPlan={plan}
        />
      )}
    </>
  )
}
