'use client'

import { useState } from 'react'
import { useSession, signIn } from 'next-auth/react'
import { usePathname } from 'next/navigation'
import type { Criterion } from '@/app//lib/scoring'
import SaveModelModal from '@/app/components/SaveModelModal'

interface SaveModelButtonProps {
  criteria: Criterion[]
  savedModelName: string | null
  /**
   * When set, the user is known (from notify-me or email-gate flow) but has no
   * session yet. We offer a one-click "send me a sign-in link" action instead of
   * asking them to navigate away to the sign-in page.
   */
  knownEmail?: string
}

export default function SaveModelButton({ criteria, savedModelName, knownEmail }: SaveModelButtonProps) {
  const { status } = useSession()
  const pathname = usePathname()
  const [showModal, setShowModal] = useState(false)
  const [modelName, setModelName] = useState<string | null>(savedModelName)
  const [linkSent, setLinkSent] = useState(false)
  const [sendingLink, setSendingLink] = useState(false)
  const [linkError, setLinkError] = useState(false)

  const handleSaved = (_modelId: string, name: string) => {
    setShowModal(false)
    setModelName(name)
  }

  const handleSendLink = async () => {
    if (!knownEmail || sendingLink) return
    setSendingLink(true)
    setLinkError(false)
    try {
      const result = await signIn('resend', {
        email: knownEmail,
        redirect: false,
        callbackUrl: `${pathname}?activated=1`,
      })
      if (result?.error) {
        console.error('[SaveModelButton] sign-in link failed:', result.error)
        setLinkError(true)
      } else {
        setLinkSent(true)
      }
    } catch (err) {
      console.error('[SaveModelButton] sign-in threw unexpectedly:', err)
      setLinkError(true)
    } finally {
      setSendingLink(false)
    }
  }

  // Saved state — same regardless of auth
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

  // Avoid flash while session loads
  if (status === 'loading') return null

  // Unauthenticated
  if (status === 'unauthenticated') {
    // Known email (notify-me / email-gate flow) — offer inline one-click sign-in link
    if (knownEmail) {
      if (linkSent) {
        return (
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-700 bg-blue-50 border border-blue-100 px-2.5 py-1 rounded-full">
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
            Check your inbox
          </span>
        )
      }

      if (linkError) {
        // Sending failed — fall back to the sign-in page so the user isn't stuck
        const activationCallbackUrl = `${pathname}?activated=1`
        const signInUrl = `/auth/signin?callbackUrl=${encodeURIComponent(activationCallbackUrl)}`
        return (
          <a
            href={signInUrl}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-red-600 bg-red-50 border border-red-200 px-2.5 py-1 rounded-full hover:bg-red-100 transition-colors"
          >
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
            </svg>
            Could not send link — sign in here
          </a>
        )
      }

      return (
        <button
          onClick={handleSendLink}
          disabled={sendingLink}
          title={`Send a sign-in link to ${knownEmail}`}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-700 bg-blue-50 border border-blue-100 px-2.5 py-1 rounded-full hover:bg-blue-100 disabled:opacity-50 transition-colors cursor-pointer"
        >
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z" />
          </svg>
          {sendingLink ? 'Sending…' : 'Sign in to save'}
        </button>
      )
    }

    // Unknown email — link to sign-in page
    const activationCallbackUrl = `${pathname}?activated=1`
    const signInUrl = `/auth/signin?callbackUrl=${encodeURIComponent(activationCallbackUrl)}`
    return (
      <a
        href={signInUrl}
        title="Sign in to enable saving"
        className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-400 bg-gray-50 border border-gray-200 px-2.5 py-1 rounded-full hover:text-gray-600 hover:border-gray-300 transition-colors"
      >
        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
        </svg>
        Activate to save
      </a>
    )
  }

  // Authenticated — full save flow
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
