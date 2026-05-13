import type { FetchProfileResult, LinkedInProfile } from './linkedapi'

const CS_BASE_URL = 'https://api.connectsafely.ai'
const MAX_RETRIES = 2
const RETRY_DELAY_MS = 3_000

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function isRetryableError(status: number, message: string): boolean {
  if (status >= 500) return true
  if (message.toLowerCase().includes('redirect')) return true
  return false
}

export type SendResult =
  | { success: true }
  | { success: false; errorCode: 'auth_failed' | 'account_disconnected' | 'rate_limited' | 'send_failed'; error: string }

function getPlatformApiKey(): string {
  const key = process.env.CONNECT_SAFELY_API_KEY
  if (!key) throw new Error('CONNECT_SAFELY_API_KEY environment variable must be set')
  return key
}

function extractProfileId(linkedinUrl: string): string {
  const match = linkedinUrl.match(/linkedin\.com\/in\/([^/?#]+)/)
  if (!match) throw new Error(`Cannot extract profile ID from LinkedIn URL: ${linkedinUrl}`)
  return match[1].replace(/\/$/, '')
}

export async function sendMessage(
  personUrl: string,
  text: string,
  apiKey?: string
): Promise<SendResult> {
  const key = apiKey ?? getPlatformApiKey()
  let profileId: string
  try {
    profileId = extractProfileId(personUrl)
  } catch {
    return { success: false, errorCode: 'send_failed', error: `Cannot extract profile ID from URL: ${personUrl}` }
  }

  let lastError = 'Unknown error'

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) await sleep(RETRY_DELAY_MS)

    try {
      const res = await fetch(`${CS_BASE_URL}/linkedin/messaging/send`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ recipientProfileId: profileId, message: text }),
      })

      const data = await res.json().catch(() => ({}))
      const msg: string = data.message ?? data.errorDetails?.message ?? data.error ?? res.statusText

      if (res.status === 401) return { success: false, errorCode: 'auth_failed', error: `ConnectSafely 401: ${msg}` }
      if (res.status === 403) return { success: false, errorCode: 'account_disconnected', error: `ConnectSafely 403: ${msg}` }
      if (res.status === 429) return { success: false, errorCode: 'rate_limited', error: `ConnectSafely 429: ${msg}` }

      if (!res.ok || data.success === false) {
        lastError = `ConnectSafely ${res.status}: ${msg}`
        if (attempt < MAX_RETRIES && isRetryableError(res.status, msg)) continue
        return { success: false, errorCode: 'send_failed', error: lastError }
      }

      return { success: true }
    } catch (err) {
      lastError = err instanceof Error ? err.message : 'Network error'
      if (attempt < MAX_RETRIES) continue
    }
  }

  return { success: false, errorCode: 'send_failed', error: lastError }
}

export function deriveSeniority(title: string | null): string | null {
  if (!title) return null
  const t = title.toLowerCase()
  if (/chief|ceo|cto|cfo|coo|cpo|founder|president(?! of)|partner|owner/.test(t)) return 'Executive'
  if (/\bvp\b|vice president/.test(t)) return 'VP'
  if (/director/.test(t)) return 'Director'
  if (/manager|head of|supervisor/.test(t)) return 'Manager'
  if (/senior|sr\.|lead|principal|\bstaff\b/.test(t)) return 'Senior'
  if (/intern|trainee|apprentice/.test(t)) return 'Intern'
  if (/junior|jr\.|entry level|associate/.test(t)) return 'Junior'
  return 'Mid'
}

export async function fetchProfile(linkedinUrl: string): Promise<FetchProfileResult> {
  if (!linkedinUrl || !linkedinUrl.includes('linkedin.com')) {
    return { status: 'skipped', profile: null, error: 'Invalid or missing LinkedIn URL' }
  }

  let profileId: string
  try {
    profileId = extractProfileId(linkedinUrl)
  } catch {
    return { status: 'skipped', profile: null, error: 'Cannot extract profile ID from LinkedIn URL' }
  }

  const apiKey = getPlatformApiKey()
  let lastError: string | undefined

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) await sleep(RETRY_DELAY_MS)

    try {
      const res = await fetch(`${CS_BASE_URL}/linkedin/profile`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          profileId,
          includeExperience: true,
          includeGeoLocation: true,
        }),
      })

      const data = await res.json().catch(() => ({}))

      if (!res.ok || data.success === false) {
        const msg = data.message ?? data.errorDetails?.message ?? data.error ?? res.statusText
        lastError = `ConnectSafely ${res.status}: ${msg}`
        if (attempt < MAX_RETRIES && isRetryableError(res.status, msg)) continue
        return { status: 'failed', profile: null, error: lastError }
      }

      if (!data.profile) {
        return { status: 'failed', profile: null, error: 'No profile data returned from ConnectSafely' }
      }

      const p = data.profile
      const firstName: string = p.firstName ?? ''
      const lastName: string = p.lastName ?? ''
      const fullName = [firstName, lastName].filter(Boolean).join(' ') || null

      const profile: LinkedInProfile = {
        linkedin_url: linkedinUrl,
        first_name: firstName || null,
        last_name: lastName || null,
        full_name: fullName,
        headline: p.headline ?? null,
        current_title: null,
        seniority: null,
        company_name: p.currentCompany ?? null,
        industry: null,
        company_size: null,
        employee_count: null,
        location: p.geoLocation?.fullLocation ?? null,
      }

      if (Array.isArray(p.experience) && p.experience.length > 0) {
        const current = p.experience[0]
        profile.current_title = current.title ?? null
        profile.company_name = current.companyName ?? p.currentCompany ?? null
      }

      profile.seniority = deriveSeniority(profile.current_title)

      return { status: 'success', profile }
    } catch (err) {
      lastError = err instanceof Error ? err.message : 'Network error'
      if (attempt < MAX_RETRIES) continue
    }
  }

  return { status: 'failed', profile: null, error: lastError }
}
