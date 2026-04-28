// Shared plan utilities — safe to import from client and server components.
//
// Set NEXT_PUBLIC_LEMON_SQUEEZY_FREE_VARIANT to the Lemon Squeezy variant ID
// for your $0 free plan. isFreePlan() uses this to determine free status from
// LS configuration rather than hardcoded plan-name strings.
//
// Fallback: if the env var is not configured, 'free' is used as the plan name.

const VARIANT_TO_PLAN: Record<string, string> = {}

const freeVariant    = process.env.NEXT_PUBLIC_LEMON_SQUEEZY_FREE_VARIANT
const starterVariant = process.env.NEXT_PUBLIC_LEMONSQUEEZY_STARTER_VARIANT_ID
const proVariant     = process.env.NEXT_PUBLIC_LEMONSQUEEZY_PRO_VARIANT_ID

if (freeVariant)    VARIANT_TO_PLAN[freeVariant]    = 'free'
if (starterVariant) VARIANT_TO_PLAN[starterVariant]  = 'starter'
if (proVariant)     VARIANT_TO_PLAN[proVariant]      = 'pro'

export function isFreePlan(plan: string): boolean {
  if (!freeVariant) return plan === 'free'
  // Derive free status from LS variant mapping:
  // 'free' maps to the free variant; paid plans map to their own variants.
  const planVariant =
    plan === 'free'    ? freeVariant    :
    plan === 'starter' ? starterVariant :
    plan === 'pro'     ? proVariant     :
    undefined  // enterprise / unknown — no standard LS variant, never free
  return planVariant === freeVariant
}
