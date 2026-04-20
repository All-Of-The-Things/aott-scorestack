import { redirect } from 'next/navigation'
import { auth } from '@/app/lib/auth'
import SignInForm from './SignInForm'

interface SignInPageProps {
  searchParams: { callbackUrl?: string }
}

/**
 * Server component — checks session first.
 * If the user is already authenticated (e.g. they clicked the email link
 * from a notify-me flow while already signed in), redirect directly to
 * callbackUrl without showing the sign-in form.
 */
export default async function SignInPage({ searchParams }: SignInPageProps) {
  // The original destination the user was trying to reach
  const destination = searchParams.callbackUrl ?? '/'

  const session = await auth()
  // Already authenticated: skip the verified page and go straight to the destination
  if (session) {
    redirect(destination)
  }

  // After the magic link is clicked, NextAuth will redirect to this URL.
  // Routing through /auth/verified gives the user an explicit sign-in confirmation
  // before they land on the destination page.
  const callbackUrl = `/auth/verified?next=${encodeURIComponent(destination)}`

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

        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
          <SignInForm callbackUrl={callbackUrl} />
        </div>
      </div>
    </main>
  )
}
