const LS_API = 'https://api.lemonsqueezy.com/v1'

export type CreditPackId = 'credits_100' | 'credits_500' | 'credits_1500' | 'credits_5000'

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
  return process.env.NEXTAUTH_URL ?? 'http://localhost:3000'
}

export async function createCheckout(
  orgId: string,
  plan: 'starter' | 'pro'
): Promise<string> {
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
            redirect_url: `${appUrl()}/settings/billing?success=1`,
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
  return json.data.attributes.url as string
}

export async function createCreditCheckout(
  orgId: string,
  packId: CreditPackId
): Promise<string> {
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
            redirect_url: `${appUrl()}/settings/billing?success=1`,
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
  return json.data.attributes.url as string
}

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

// LS variant_id comes back as a number — convert to string before comparing env vars.
export function getPlanFromVariantId(variantId: string | number): 'starter' | 'pro' | null {
  const id = String(variantId)
  if (id === process.env.LEMONSQUEEZY_STARTER_VARIANT_ID) return 'starter'
  if (id === process.env.LEMONSQUEEZY_PRO_VARIANT_ID) return 'pro'
  return null
}
