import { NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/app/lib/auth'
import prisma from '@/app/lib/prisma'
import { createCreditCheckout } from '@/app/lib/billing'

const Schema = z.object({
  variantId: z.string().min(1),
  credits:   z.number().int().positive(),
})

export async function POST(req: Request) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const orgId = session.user.orgId
  if (!orgId) return NextResponse.json({ error: 'account_setup_incomplete' }, { status: 503 })

  const parsed = Schema.safeParse(await req.json())
  if (!parsed.success) return NextResponse.json({ error: 'invalid_input' }, { status: 400 })

  const { variantId, credits } = parsed.data

  try {
    const checkout = await createCreditCheckout(orgId, variantId, credits)

    await prisma.pendingCheckout.create({
      data: {
        orgId,
        userId:       session.user.id,
        lsCheckoutId: checkout.checkoutId,
        variantId:    checkout.variantId,
        credits,
      },
    })

    return NextResponse.json({ checkout_url: checkout.url })
  } catch (err) {
    console.error('[billing/credits]', err)
    return NextResponse.json({ error: 'checkout_failed' }, { status: 502 })
  }
}
