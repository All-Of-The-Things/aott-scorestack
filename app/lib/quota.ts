import prisma from './prisma'

export interface PlanLimits {
  runLimit: number    // -1 = unlimited
  modelLimit: number
  seatLimit: number
}

interface CacheEntry { limits: PlanLimits; expiresAt: number }
const cache = new Map<string, CacheEntry>()
const CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes

// Fallback used on DB error — mirrors the seed values
const FALLBACK: Record<string, PlanLimits> = {
  free:       { runLimit: 50,  modelLimit: 1,  seatLimit: 1  },
  starter:    { runLimit: -1,  modelLimit: 5,  seatLimit: 1  },
  pro:        { runLimit: -1,  modelLimit: -1, seatLimit: 3  },
  enterprise: { runLimit: -1,  modelLimit: -1, seatLimit: -1 },
}

export async function getPlanLimitsFor(plan: string): Promise<PlanLimits> {
  const now = Date.now()
  const cached = cache.get(plan)
  if (cached && cached.expiresAt > now) return cached.limits

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const row = await prisma.planLimit.findUnique({ where: { plan: plan as any } })
    if (!row) return FALLBACK['free']!
    const limits: PlanLimits = { runLimit: row.runLimit, modelLimit: row.modelLimit, seatLimit: row.seatLimit }
    cache.set(plan, { limits, expiresAt: now + CACHE_TTL_MS })
    return limits
  } catch (err) {
    console.error('[quota] DB read failed, using fallback:', err)
    return FALLBACK[plan] ?? FALLBACK['free']!
  }
}
