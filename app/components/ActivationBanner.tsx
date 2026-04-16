'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

// Shown on the results page when the user just clicked a magic link (?activated=1).
// Cleans the URL param after mount so refreshes don't re-show the banner.
export default function ActivationBanner() {
  const router = useRouter()

  useEffect(() => {
    // Remove ?activated=1 from the URL without a full navigation
    const url = new URL(window.location.href)
    url.searchParams.delete('activated')
    router.replace(url.pathname + (url.search ? url.search : ''), { scroll: false })
  }, [router])

  return (
    <div className="mb-6 flex items-start gap-3 p-4 bg-green-50 border border-green-200 rounded-xl">
      <svg
        className="w-4 h-4 text-green-500 shrink-0 mt-0.5"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2}
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      <div>
        <p className="text-sm font-medium text-green-800">Account activated</p>
        <p className="text-xs text-green-700 mt-0.5">
          You can now save scoring models and reuse them on future uploads.
        </p>
      </div>
    </div>
  )
}
