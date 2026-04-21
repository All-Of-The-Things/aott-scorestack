import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { auth } from '@/app/lib/auth'
import ConfirmedClient from './ConfirmedClient'

export default async function ConfirmedPage() {
  const session = await auth()

  if (!session) {
    redirect('/auth/signin')
  }

  // Read the destination stored by SignInForm before the magic link was sent.
  // Using a cookie avoids the double-encoding problem with nested callbackUrl
  // query params in the Resend/email magic-link flow.
  const cookieStore = await cookies()
  const raw = cookieStore.get('auth_next')?.value
  const next = raw && decodeURIComponent(raw).startsWith('/') ? decodeURIComponent(raw) : '/'

  return <ConfirmedClient email={session.user.email ?? ''} next={next} />
}
