import { redirect } from 'next/navigation'
import { auth } from '@/app/lib/auth'
import ConfirmedClient from './ConfirmedClient'

interface ConfirmedPageProps {
  searchParams: { next?: string }
}

export default async function ConfirmedPage({ searchParams }: ConfirmedPageProps) {
  const session = await auth()

  // Sanitise next — only allow relative paths to prevent open redirects.
  const raw = searchParams.next ?? '/'
  const next = raw.startsWith('/') ? raw : '/'

  // No session — magic link may have expired or been used already.
  if (!session) {
    redirect(`/auth/signin?callbackUrl=${encodeURIComponent(next)}`)
  }

  return <ConfirmedClient email={session.user.email ?? ''} next={next} />
}
