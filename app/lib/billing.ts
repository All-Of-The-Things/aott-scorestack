const LS_API = 'https://api.lemonsqueezy.com/v1'

export type CreditPackId = 'credits_100' | 'credits_500' | 'credits_1500' | 'credits_5000'

export type VariantDetails = {
  name: string
  price: number        // cents
  interval: 'month' | 'year' | null
}

// Env var holds the LS *variant* ID for the one-time product, even though
// the variable name says PRODUCT_ID (common LS naming convention).
const CREDIT_PACK_CONFIGS: Record<CreditPackId, { credits: number; envVar: string }> = {
  credits_100:  { credits: 100,  envVar: 'LEMONSQUEEZY_CREDITS_100_PRODUCT_ID'  },
  credits_500:  { credits: 500,  envVar: 'LEMONSQUEEZY_CREDITS_500_PRODUCT_ID'  },
  credits_1500: { credits: 1500, envVar: 'LEMONSQUEEZY_CREDITS_1500_PRODUCT_ID' },
  credits_5000: { credits: 5000, envVar: 'LEMONSQUEEZY_CREDITS_5000_PRODUCT_ID' },
}

function lsHeaders() {
  return {
    Authorization: `Bearer ${process.env.LEMONSQUEEZY_API_KEY}`,
    'Content-Type': 'application/vnd.api+json',
    Accept: 'application/vnd.api+json',
  }
}

function appUrl() {
  if (process.env.NEXTAUTH_URL) return process.env.NEXTAUTH_URL
  if (process.env.VERCEL_URL)   return `https://${process.env.VERCEL_URL}`
  return 'http://localhost:3000'
}

// ---------------------------------------------------------------------------
// Variant / product data
// ---------------------------------------------------------------------------

// Cached for 1 hour at the fetch layer so repeated page loads don't hit LS.
export async function fetchVariantDetails(variantId: string): Promise<VariantDetails> {
  const res = await fetch(`${LS_API}/variants/${variantId}`, {
    headers: lsHeaders(),
    next: { revalidate: 3600 },
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`LS variant fetch ${res.status}: ${text}`)
  }
  const json = await res.json()
  const attrs = json.data.attributes
  return {
    name: attrs.name as string,
    price: attrs.price as number,
    interval: (attrs.interval ?? null) as 'month' | 'year' | null,
  }
}

// ---------------------------------------------------------------------------
// Checkout retrieval (used by the confirmation page)
// ---------------------------------------------------------------------------

export type CheckoutDetails = {
  variantId: string
  expiresAt: string | null
}

export async function fetchCheckoutDetails(checkoutId: string): Promise<CheckoutDetails | null> {
  const res = await fetch(`${LS_API}/checkouts/${checkoutId}`, {
    headers: { Authorization: `Bearer ${process.env.LEMONSQUEEZY_API_KEY}`, Accept: 'application/vnd.api+json' },
  })
  if (!res.ok) return null
  const json = await res.json()
  const attrs = json.data.attributes
  return {
    variantId:  String(attrs.variant_id),
    expiresAt:  attrs.expires_at ?? null,
  }
}

// ---------------------------------------------------------------------------
// Checkout creation
// ---------------------------------------------------------------------------

export type CheckoutResult = {
  url:         string
  checkoutId:  string
  variantId:   string
}

export async function createCheckout(
  orgId: string,
  plan: 'starter' | 'pro'
): Promise<CheckoutResult> {
  const variantId =
    plan === 'starter'
      ? process.env.LEMONSQUEEZY_STARTER_VARIANT_ID
      : process.env.LEMONSQUEEZY_PRO_VARIANT_ID

  if (!variantId) throw new Error(`Missing LS variant ID for plan: ${plan}`)

  const res = await fetch(`${LS_API}/checkouts`, {
    method: 'POST',
    headers: lsHeaders(),
    body: JSON.stringify({
      data: {
        type: 'checkouts',
        attributes: {
          checkout_data: { custom: { orgId } },
          product_options: {
            redirect_url: `${appUrl()}/settings/billing/confirmation`,
          },
        },
        relationships: {
          store: { data: { type: 'stores', id: process.env.LEMONSQUEEZY_STORE_ID } },
          variant: { data: { type: 'variants', id: variantId } },
        },
      },
    }),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`LS checkout ${res.status}: ${text}`)
  }

  const json = await res.json()
  return {
    url:        json.data.attributes.url as string,
    checkoutId: json.data.id as string,
    variantId,
  }
}

export type CreditCheckoutResult = CheckoutResult & { credits: number }

export async function createCreditCheckout(
  orgId: string,
  packId: CreditPackId
): Promise<CreditCheckoutResult> {
  const config = CREDIT_PACK_CONFIGS[packId]
  const variantId = process.env[config.envVar]
  if (!variantId) throw new Error(`Missing LS variant ID for credit pack: ${packId}`)

  const res = await fetch(`${LS_API}/checkouts`, {
    method: 'POST',
    headers: lsHeaders(),
    body: JSON.stringify({
      data: {
        type: 'checkouts',
        attributes: {
          checkout_data: {
            custom: { orgId, credits: config.credits },
          },
          product_options: {
            redirect_url: `${appUrl()}/settings/billing/confirmation`,
          },
        },
        relationships: {
          store: { data: { type: 'stores', id: process.env.LEMONSQUEEZY_STORE_ID } },
          variant: { data: { type: 'variants', id: variantId } },
        },
      },
    }),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`LS credits checkout ${res.status}: ${text}`)
  }

  const json = await res.json()
  return {
    url:        json.data.attributes.url as string,
    checkoutId: json.data.id as string,
    variantId,
    credits:    config.credits,
  }
}

// ---------------------------------------------------------------------------
// Customer portal
// ---------------------------------------------------------------------------

// LS customer portal URL lives in GET /v1/customers/{id} → data.attributes.urls.customer_portal
export async function createPortalUrl(lsCustomerId: string): Promise<string> {
  const res = await fetch(`${LS_API}/customers/${lsCustomerId}`, {
    headers: lsHeaders(),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`LS customer ${res.status}: ${text}`)
  }

  const json = await res.json()
  return json.data.attributes.urls.customer_portal as string
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// LS variant_id comes back as a number — convert to string before comparing env vars.
export function getPlanFromVariantId(variantId: string | number): 'starter' | 'pro' | null {
  const id = String(variantId)
  if (id === process.env.LEMONSQUEEZY_STARTER_VARIANT_ID) return 'starter'
  if (id === process.env.LEMONSQUEEZY_PRO_VARIANT_ID) return 'pro'
  return null
}
