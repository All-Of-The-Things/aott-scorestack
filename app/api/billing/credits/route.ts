import { NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/app/lib/auth'
import { createCreditCheckout } from '@/app/lib/billing'

const Schema = z.object({
  packId: z.enum(['credits_100', 'credits_500', 'credits_1500', 'credits_5000']),
})

export async function POST(req: Request) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const orgId = session.user.orgId
  if (!orgId) return NextResponse.json({ error: 'account_setup_incomplete' }, { status: 503 })

  const parsed = Schema.safeParse(await req.json())
  if (!parsed.success) return NextResponse.json({ error: 'invalid_input' }, { status: 400 })

  try {
    const checkout_url = await createCreditCheckout(orgId, parsed.data.packId)
    return NextResponse.json({ checkout_url })
  } catch (err) {
    console.error('[billing/credits]', err)
    return NextResponse.json({ error: 'checkout_failed' }, { status: 502 })
  }
}
