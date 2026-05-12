import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { auth } from '@/app/lib/auth'
import ConfirmedClient from './ConfirmedClient'

interface Props {
  searchParams: { next?: string }
}

export default async function ConfirmedPage({ searchParams }: Props) {
  // Compute destination before the session check so the fallback redirect can
  // preserve it. Primary: URL param (survives cross-device). Fallback: cookie.
  const urlNext = searchParams.next?.startsWith('/') ? searchParams.next : null

  const cookieStore = cookies()
  const raw        = cookieStore.get('auth_next')?.value
  const decoded    = raw ? decodeURIComponent(raw) : null
  const cookieNext = decoded?.startsWith('/') ? decoded : null

  const next = urlNext ?? cookieNext ?? '/'

  const session = await auth()

  if (!session) {
    redirect(`/auth/signin?callbackUrl=${encodeURIComponent(next)}`)
  }

  return <ConfirmedClient email={session.user.email ?? ''} next={next} />
}
