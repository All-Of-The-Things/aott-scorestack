import { createHmac, timingSafeEqual } from 'crypto'
import { NextResponse } from 'next/server'
import prisma from '@/app/lib/prisma'
import { getPlanFromVariantId } from '@/app/lib/billing'
import type { Plan, SubscriptionStatus } from '@/app/generated/prisma'

// Raw body must be read before any JSON.parse — HMAC is computed over the raw bytes.
export async function POST(req: Request) {
  const rawBody = await req.text()
  const signature = req.headers.get('x-signature') ?? ''
  const secret = process.env.LEMONSQUEEZY_WEBHOOK_SECRET

  if (!secret) {
    console.error('[ls-webhook] LEMONSQUEEZY_WEBHOOK_SECRET not set')
    return NextResponse.json({ error: 'misconfigured' }, { status: 500 })
  }

  const expected = createHmac('sha256', secret).update(rawBody).digest('hex')
  const sigBuf = Buffer.from(signature, 'hex')
  const expBuf = Buffer.from(expected, 'hex')

  if (
    sigBuf.length !== expBuf.length ||
    !timingSafeEqual(sigBuf, expBuf)
  ) {
    return NextResponse.json({ error: 'invalid_signature' }, { status: 401 })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const payload: any = JSON.parse(rawBody)
  const eventName: string = payload?.meta?.event_name ?? ''

  try {
    switch (eventName) {
      case 'subscription_created':
        await handleSubscriptionCreated(payload)
        break
      case 'subscription_updated':
        await handleSubscriptionUpdated(payload)
        break
      case 'subscription_cancelled':
        await handleSubscriptionCancelled(payload)
        break
      case 'subscription_expired':
        await handleSubscriptionExpired(payload)
        break
      case 'subscription_payment_failed':
        await handleSubscriptionPaymentFailed(payload)
        break
      case 'order_created':
        await handleOrderCreated(payload)
        break
      default:
        // Unknown events are acknowledged but not processed
        break
    }
  } catch (err) {
    console.error(`[ls-webhook] handler error for ${eventName}:`, err)
    return NextResponse.json({ error: 'handler_error' }, { status: 500 })
  }

  return NextResponse.json({ received: true })
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleSubscriptionCreated(payload: any) {
  const orgId: string = payload.meta?.custom_data?.orgId
  if (!orgId) return

  const attrs = payload.data?.attributes ?? {}
  const lsSubscriptionId = String(payload.data.id)
  const lsCustomerId = String(attrs.customer_id)
  const variantId = attrs.variant_id
  const plan = getPlanFromVariantId(variantId) ?? 'starter'
  const status = mapLsStatus(attrs.status)
  const currentPeriodEnd = new Date(attrs.renews_at ?? attrs.ends_at)

  await prisma.$transaction([
    prisma.organization.update({
      where: { id: orgId },
      data: { plan: plan as Plan, lsCustomerId },
    }),
    prisma.subscription.upsert({
      where: { orgId },
      create: {
        orgId,
        lsSubscriptionId,
        lsCustomerId,
        plan: plan as Plan,
        status,
        currentPeriodEnd,
      },
      update: {
        lsSubscriptionId,
        lsCustomerId,
        plan: plan as Plan,
        status,
        currentPeriodEnd,
      },
    }),
  ])
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleSubscriptionUpdated(payload: any) {
  const attrs = payload.data?.attributes ?? {}
  const lsSubscriptionId = String(payload.data.id)
  const variantId = attrs.variant_id
  const plan = getPlanFromVariantId(variantId)
  const status = mapLsStatus(attrs.status)
  const currentPeriodEnd = new Date(attrs.renews_at ?? attrs.ends_at)
  const cancelAtPeriodEnd: boolean = attrs.cancelled ?? false

  const sub = await prisma.subscription.findUnique({
    where: { lsSubscriptionId },
    select: { orgId: true },
  })
  if (!sub) return

  await prisma.$transaction([
    prisma.subscription.update({
      where: { lsSubscriptionId },
      data: {
        ...(plan ? { plan: plan as Plan } : {}),
        status,
        currentPeriodEnd,
        cancelAtPeriodEnd,
      },
    }),
    ...(plan
      ? [prisma.organization.update({
          where: { id: sub.orgId },
          data: { plan: plan as Plan },
        })]
      : []),
  ])
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleSubscriptionCancelled(payload: any) {
  const lsSubscriptionId = String(payload.data.id)
  await prisma.subscription.updateMany({
    where: { lsSubscriptionId },
    data: { cancelAtPeriodEnd: true },
  })
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleSubscriptionExpired(payload: any) {
  const lsSubscriptionId = String(payload.data.id)

  const sub = await prisma.subscription.findUnique({
    where: { lsSubscriptionId },
    select: { orgId: true },
  })
  if (!sub) return

  await prisma.$transaction([
    prisma.subscription.update({
      where: { lsSubscriptionId },
      data: { status: 'expired' as SubscriptionStatus },
    }),
    prisma.organization.update({
      where: { id: sub.orgId },
      data: { plan: 'free' as Plan },
    }),
  ])
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleSubscriptionPaymentFailed(payload: any) {
  const lsSubscriptionId = String(payload.data.id)
  // 3-day grace period — set past_due but do NOT downgrade yet.
  await prisma.subscription.updateMany({
    where: { lsSubscriptionId },
    data: { status: 'past_due' as SubscriptionStatus },
  })
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleOrderCreated(payload: any) {
  const custom = payload.meta?.custom_data ?? {}
  const orgId: string = custom.orgId
  const credits: number = Number(custom.credits)
  if (!orgId || !credits) return

  const lsOrderId = String(payload.data.id)
  const amountCents: number = payload.data?.attributes?.total ?? 0

  // Idempotent: skip if this order was already processed.
  const existing = await prisma.creditPurchase.findUnique({
    where: { lsOrderId },
  })
  if (existing) return

  await prisma.$transaction([
    prisma.creditPurchase.create({
      data: { orgId, lsOrderId, credits, amountCents },
    }),
    prisma.organization.update({
      where: { id: orgId },
      data: { managedCreditsBalance: { increment: credits } },
    }),
  ])
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mapLsStatus(lsStatus: string): SubscriptionStatus {
  const map: Record<string, SubscriptionStatus> = {
    active: 'active',
    trialing: 'trialing',
    past_due: 'past_due',
    cancelled: 'canceled',
    unpaid: 'unpaid',
    expired: 'expired',
  }
  return map[lsStatus] ?? 'active'
}
