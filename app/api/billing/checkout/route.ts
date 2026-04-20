import { NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/app/lib/auth'
import { createCheckout } from '@/app/lib/billing'

const Schema = z.object({
  plan: z.enum(['starter', 'pro']),
})

export async function POST(req: Request) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const orgId = session.user.orgId
  if (!orgId) return NextResponse.json({ error: 'account_setup_incomplete' }, { status: 503 })

  const parsed = Schema.safeParse(await req.json())
  if (!parsed.success) return NextResponse.json({ error: 'invalid_input' }, { status: 400 })

  try {
    const checkout_url = await createCheckout(orgId, parsed.data.plan)
    return NextResponse.json({ checkout_url })
  } catch (err) {
    console.error('[billing/checkout]', err)
    return NextResponse.json({ error: 'checkout_failed' }, { status: 502 })
  }
}
