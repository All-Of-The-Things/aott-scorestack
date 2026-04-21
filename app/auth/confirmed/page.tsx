import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { auth } from '@/app/lib/auth'
import ConfirmedClient from './ConfirmedClient'

interface Props {
  searchParams: { next?: string }
}

export default async function ConfirmedPage({ searchParams }: Props) {
  const session = await auth()

  if (!session) {
    redirect('/auth/signin')
  }

  // Primary: destination is encoded in the URL by SignInForm (survives cross-device clicks).
  // Fallback: cookie set by SignInForm for same-browser flows.
  const urlNext = searchParams.next?.startsWith('/') ? searchParams.next : null

  const cookieStore = cookies()
  const raw        = cookieStore.get('auth_next')?.value
  const cookieNext = raw && decodeURIComponent(raw).startsWith('/') ? decodeURIComponent(raw) : null

  const next = urlNext ?? cookieNext ?? '/'

  return <ConfirmedClient email={session.user.email ?? ''} next={next} />
}
