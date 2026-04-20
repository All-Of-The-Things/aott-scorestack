import { NextResponse } from 'next/server'
import { auth } from '@/app/lib/auth'
import { createPortalUrl } from '@/app/lib/billing'
import prisma from '@/app/lib/prisma'

export async function POST() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const orgId = session.user.orgId
  if (!orgId) return NextResponse.json({ error: 'account_setup_incomplete' }, { status: 503 })

  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: { lsCustomerId: true },
  })

  if (!org?.lsCustomerId) {
    return NextResponse.json({ error: 'no_billing_account' }, { status: 404 })
  }

  try {
    const portal_url = await createPortalUrl(org.lsCustomerId)
    return NextResponse.json({ portal_url })
  } catch (err) {
    console.error('[billing/portal]', err)
    return NextResponse.json({ error: 'portal_failed' }, { status: 502 })
  }
}
