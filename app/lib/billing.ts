const LS_API = 'https://api.lemonsqueezy.com/v1';

export type VariantDetails = {
  price: number; // cents
  interval: 'month' | 'year' | null;
};

export type CreditPack = {
  variantId: string;
  credits: number;
  price: number; // cents
  name: string;
};

// Variant name in LS must exactly match a key here (case-insensitive).
// Convention: name the LS variants "Free", "Starter", "Pro".
const VARIANT_NAME_TO_PLAN: Record<string, 'free' | 'starter' | 'pro'> = {
  free: 'free',
  starter: 'starter',
  pro: 'pro'
};

export type PlanVariant = {
  variantId: string;
  plan: 'free' | 'starter' | 'pro';
  name: string;
  price: number; // cents
  interval: 'month' | 'year' | null;
};

function lsHeaders() {
  return {
    Authorization: `Bearer ${process.env.LEMONSQUEEZY_API_KEY}`,
    'Content-Type': 'application/vnd.api+json',
    Accept: 'application/vnd.api+json'
  };
}

function appUrl() {
  return (
    process.env.NEXTAUTH_URL ||
    `https://${process.env.VERCEL_URL}` ||
    'http://localhost:3000'
  );
}

// ---------------------------------------------------------------------------
// Variant / product data
// ---------------------------------------------------------------------------

// Fetches plan variants from Lemon Squeezy.
//
// Primary path: LEMONSQUEEZY_PLANS_PRODUCT_ID is set → fetch all variants for
// that product and map them by name ("Free", "Starter", "Pro").
//
// Fallback path: only the individual LEMONSQUEEZY_STARTER_VARIANT_ID /
// LEMONSQUEEZY_PRO_VARIANT_ID env vars are set → fetch each variant
// separately and construct the list. Free is added as a $0 entry with no
// variantId (it has no checkout flow).
export async function fetchPlanVariants(): Promise<PlanVariant[]> {
  const productId = process.env.LEMONSQUEEZY_PLANS_PRODUCT_ID;

  if (productId) {
    try {
      const res = await fetch(
        `${LS_API}/variants?filter[product_id]=${productId}&sort=sort`,
        { headers: lsHeaders(), next: { revalidate: 3600 } }
      );
      if (!res.ok) return fetchPlanVariantsFallback();

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const json = await res.json();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const variants: PlanVariant[] = (json.data as any[])
        .filter((v) => v.attributes.status === 'published')
        .flatMap((v) => {
          const plan = VARIANT_NAME_TO_PLAN[String(v.attributes.name).toLowerCase()];
          if (!plan) return [];
          return [{
            variantId: String(v.id),
            plan,
            name:     String(v.attributes.name),
            price:    v.attributes.price as number,
            interval: (v.attributes.interval ?? null) as 'month' | 'year' | null,
          }];
        });

      return variants.sort((a, b) => a.price - b.price);
    } catch {
      return fetchPlanVariantsFallback();
    }
  }

  return fetchPlanVariantsFallback();
}

async function fetchPlanVariantsFallback(): Promise<PlanVariant[]> {
  const starterVariantId = process.env.LEMONSQUEEZY_STARTER_VARIANT_ID;
  const proVariantId     = process.env.LEMONSQUEEZY_PRO_VARIANT_ID;

  const free: PlanVariant = { variantId: '', plan: 'free', name: 'Free', price: 0, interval: null };

  const [starterResult, proResult] = await Promise.allSettled([
    starterVariantId ? fetchVariantDetails(starterVariantId) : Promise.reject(),
    proVariantId     ? fetchVariantDetails(proVariantId)     : Promise.reject(),
  ]);

  const variants: PlanVariant[] = [free];

  if (starterResult.status === 'fulfilled' && starterVariantId) {
    variants.push({ variantId: starterVariantId, plan: 'starter', name: 'Starter', ...starterResult.value });
  }
  if (proResult.status === 'fulfilled' && proVariantId) {
    variants.push({ variantId: proVariantId, plan: 'pro', name: 'Pro', ...proResult.value });
  }

  return variants;
}

// Cached for 1 hour at the fetch layer so repeated page loads don't hit LS.
export async function fetchVariantDetails(
  variantId: string
): Promise<VariantDetails> {
  const res = await fetch(`${LS_API}/variants/${variantId}`, {
    headers: lsHeaders(),
    next: { revalidate: 3600 }
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`LS variant fetch ${res.status}: ${text}`);
  }
  const json = await res.json();
  const attrs = json.data.attributes;
  return {
    price: attrs.price as number,
    interval: (attrs.interval ?? null) as 'month' | 'year' | null
  };
}

// ---------------------------------------------------------------------------
// Checkout retrieval (used by the confirmation page)
// ---------------------------------------------------------------------------

export type CheckoutDetails = {
  variantId: string;
  expiresAt: string | null;
};

export async function fetchCheckoutDetails(
  checkoutId: string
): Promise<CheckoutDetails | null> {
  const res = await fetch(`${LS_API}/checkouts/${checkoutId}`, {
    headers: {
      Authorization: `Bearer ${process.env.LEMONSQUEEZY_API_KEY}`,
      Accept: 'application/vnd.api+json'
    }
  });
  if (!res.ok) return null;
  const json = await res.json();
  const attrs = json.data.attributes;
  return {
    variantId: String(attrs.variant_id),
    expiresAt: attrs.expires_at ?? null
  };
}

// ---------------------------------------------------------------------------
// Checkout creation
// ---------------------------------------------------------------------------

export type CheckoutResult = {
  url: string;
  checkoutId: string;
  variantId: string;
};

export async function createCheckout(
  orgId: string,
  variantId: string
): Promise<CheckoutResult> {
  const res = await fetch(`${LS_API}/checkouts`, {
    method: 'POST',
    headers: lsHeaders(),
    body: JSON.stringify({
      data: {
        type: 'checkouts',
        attributes: {
          checkout_data: { custom: { orgId } },
          product_options: {
            redirect_url: `${appUrl()}/settings/billing/confirmation`
          }
        },
        relationships: {
          store: {
            data: { type: 'stores', id: process.env.LEMONSQUEEZY_STORE_ID }
          },
          variant: { data: { type: 'variants', id: variantId } }
        }
      }
    })
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`LS checkout ${res.status}: ${text}`);
  }

  const json = await res.json();
  return {
    url: json.data.attributes.url as string,
    checkoutId: json.data.id as string,
    variantId
  };
}

export async function createCreditCheckout(
  orgId: string,
  variantId: string,
  credits: number
): Promise<CheckoutResult> {
  const res = await fetch(`${LS_API}/checkouts`, {
    method: 'POST',
    headers: lsHeaders(),
    body: JSON.stringify({
      data: {
        type: 'checkouts',
        attributes: {
          checkout_data: {
            custom: { orgId, credits }
          },
          product_options: {
            redirect_url: `${appUrl()}/settings/billing/confirmation`
          }
        },
        relationships: {
          store: {
            data: { type: 'stores', id: process.env.LEMONSQUEEZY_STORE_ID }
          },
          variant: { data: { type: 'variants', id: variantId } }
        }
      }
    })
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`LS credits checkout ${res.status}: ${text}`);
  }

  const json = await res.json();
  return {
    url: json.data.attributes.url as string,
    checkoutId: json.data.id as string,
    variantId
  };
}

// ---------------------------------------------------------------------------
// Credit packs (dynamic — fetched from a single LS product's variants)
// ---------------------------------------------------------------------------

// Variant naming convention: leading integer = credit count (e.g. "100 Credits").
// Variants are sorted by the `sort` field set in the LS dashboard.
// Returns [] if LEMONSQUEEZY_CREDITS_PRODUCT_ID is unset or the fetch fails.
export async function fetchCreditPacks(): Promise<CreditPack[]> {
  const productId = process.env.LEMONSQUEEZY_CREDITS_PRODUCT_ID;
  if (!productId) return [];

  try {
    const res = await fetch(
      `${LS_API}/variants?filter[product_id]=${productId}&sort=sort`,
      { headers: lsHeaders(), next: { revalidate: 3600 } }
    );
    if (!res.ok) return [];

    const json = await res.json();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const packs: CreditPack[] = (json.data as any[])
      .filter((v) => v.attributes.status === 'published')
      .map((v) => ({
        variantId: String(v.id),
        credits: parseInt(v.attributes.name, 10),
        price: v.attributes.price as number,
        name: v.attributes.name as string
      }))
      .filter((p) => p.credits > 0);

    return packs;
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Customer portal
// ---------------------------------------------------------------------------

// LS customer portal URL lives in GET /v1/customers/{id} → data.attributes.urls.customer_portal
export async function createPortalUrl(lsCustomerId: string): Promise<string> {
  const res = await fetch(`${LS_API}/customers/${lsCustomerId}`, {
    headers: lsHeaders()
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`LS customer ${res.status}: ${text}`);
  }

  const json = await res.json();
  return json.data.attributes.urls.customer_portal as string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// LS variant_id comes back as a number — convert to string before comparing env vars.
export function getPlanFromVariantId(
  variantId: string | number
): 'starter' | 'pro' | null {
  const id = String(variantId);
  if (id === process.env.LEMONSQUEEZY_STARTER_VARIANT_ID) return 'starter';
  if (id === process.env.LEMONSQUEEZY_PRO_VARIANT_ID) return 'pro';
  return null;
}
