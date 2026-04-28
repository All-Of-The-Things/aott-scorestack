import prisma from './prisma'
import { isFreePlan } from './planUtils'

export interface PlanLimits {
  runLimit: number    // -1 = unlimited
  modelLimit: number
  seatLimit: number
  isFree: boolean     // derived from LEMON_SQUEEZY_FREE_VARIANT — not stored in DB
  exportEnabled: boolean
  messagesEnabled: boolean
  deliveryEnabled: boolean
}

interface CacheEntry { limits: PlanLimits; expiresAt: number }
const cache = new Map<string, CacheEntry>()
const CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes

// Fallback used on DB error — mirrors the seed values
const FALLBACK: Record<string, PlanLimits> = {
  free:       { runLimit: 50,  modelLimit: 1,  seatLimit: 1,  isFree: true,  exportEnabled: false, messagesEnabled: false, deliveryEnabled: false },
  starter:    { runLimit: -1,  modelLimit: 5,  seatLimit: 1,  isFree: false, exportEnabled: true,  messagesEnabled: true,  deliveryEnabled: false },
  pro:        { runLimit: -1,  modelLimit: -1, seatLimit: 3,  isFree: false, exportEnabled: true,  messagesEnabled: true,  deliveryEnabled: true  },
  enterprise: { runLimit: -1,  modelLimit: -1, seatLimit: -1, isFree: false, exportEnabled: true,  messagesEnabled: true,  deliveryEnabled: true  },
}


export async function getPlanLimitsFor(plan: string): Promise<PlanLimits> {
  const now = Date.now()
  const cached = cache.get(plan)
  if (cached && cached.expiresAt > now) return cached.limits

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const row = await prisma.planLimit.findUnique({ where: { plan: plan as any } })
    if (!row) return FALLBACK['free']!
    const limits: PlanLimits = {
      runLimit:        row.runLimit,
      modelLimit:      row.modelLimit,
      seatLimit:       row.seatLimit,
      isFree:          isFreePlan(plan),
      exportEnabled:   row.exportEnabled,
      messagesEnabled: row.messagesEnabled,
      deliveryEnabled: row.deliveryEnabled,
    }
    cache.set(plan, { limits, expiresAt: now + CACHE_TTL_MS })
    return limits
  } catch (err) {
    console.error('[quota] DB read failed, using fallback:', err)
    return FALLBACK[plan] ?? FALLBACK['free']!
  }
}
