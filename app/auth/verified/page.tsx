import { redirect } from 'next/navigation'
import Link from 'next/link'
import { auth } from '@/app/lib/auth'

interface VerifiedPageProps {
  searchParams: { next?: string }
}

export default async function VerifiedPage({ searchParams }: VerifiedPageProps) {
  const session = await auth()

  // Sanitize: `next` must be a local path to prevent open redirect.
  // Decode once in case NextAuth percent-encodes the callbackUrl value.
  const rawNext = searchParams.next ? decodeURIComponent(searchParams.next) : ''
  const next = rawNext.startsWith('/') ? rawNext : '/'

  if (!session) {
    redirect(`/auth/signin?callbackUrl=${encodeURIComponent(next)}`)
  }

  return (
    <main className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">

        {/* Logo */}
        <div className="flex items-center justify-center gap-2 mb-8">
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

        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8 text-center">
          <div className="w-12 h-12 bg-green-50 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg
              className="w-6 h-6 text-green-500"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
            </svg>
          </div>

          <h1 className="text-base font-semibold text-gray-900 mb-1">You&apos;re signed in</h1>
          <p className="text-sm text-gray-500 mb-6">
            Signed in as{' '}
            <span className="font-medium text-gray-700">{session.user.email}</span>.
          </p>

          <Link
            href={next}
            className="inline-flex items-center justify-center w-full gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
          >
            Continue
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
            </svg>
          </Link>
        </div>

      </div>
    </main>
  )
}
