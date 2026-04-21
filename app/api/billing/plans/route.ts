import { NextResponse } from 'next/server'
import { fetchVariantDetails } from '@/app/lib/billing'

// Revalidate every hour — plan prices almost never change at runtime.
export const revalidate = 3600

const FALLBACK = {
  starter: { price: '$29', period: '/mo', name: 'Starter' },
  pro:     { price: '$49', period: '/mo', name: 'Pro'     },
}

function variantToDisplay(v: { name: string; price: number; interval: 'month' | 'year' | null }) {
  return {
    name:   v.name,
    price:  `$${Math.round(v.price / 100)}`,
    period: v.interval === 'month' ? '/mo' : v.interval === 'year' ? '/yr' : '',
  }
}

export async function GET() {
  const starterVariantId = process.env.LEMONSQUEEZY_STARTER_VARIANT_ID
  const proVariantId     = process.env.LEMONSQUEEZY_PRO_VARIANT_ID

  if (!starterVariantId || !proVariantId) {
    return NextResponse.json(FALLBACK)
  }

  const [starter, pro] = await Promise.allSettled([
    fetchVariantDetails(starterVariantId),
    fetchVariantDetails(proVariantId),
  ])

  return NextResponse.json({
    starter: starter.status === 'fulfilled' ? variantToDisplay(starter.value) : FALLBACK.starter,
    pro:     pro.status     === 'fulfilled' ? variantToDisplay(pro.value)     : FALLBACK.pro,
  })
}
