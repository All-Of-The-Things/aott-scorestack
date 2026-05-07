import type { FetchProfileResult, LinkedInProfile } from './linkedapi'

const CS_BASE_URL = 'https://api.connectsafely.ai'
const MAX_SEND_RETRIES = 2
const RETRY_DELAY_MS = 3_000

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function isRetryableSendError(status: number, message: string): boolean {
  if (status >= 500) return true
  if (message.toLowerCase().includes('redirect')) return true
  return false
}

function getApiKey(): string {
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
  text: string
): Promise<{ success: boolean; error?: string }> {
  const apiKey = getApiKey()
  let profileId: string
  try {
    profileId = extractProfileId(personUrl)
  } catch {
    return { success: false, error: `Cannot extract profile ID from URL: ${personUrl}` }
  }

  let lastError: string | undefined

  for (let attempt = 0; attempt <= MAX_SEND_RETRIES; attempt++) {
    if (attempt > 0) await sleep(RETRY_DELAY_MS)

    try {
      const res = await fetch(`${CS_BASE_URL}/linkedin/messaging/send`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ recipientProfileId: profileId, message: text }),
      })

      const data = await res.json().catch(() => ({}))

      if (!res.ok || data.success === false) {
        const msg = data.message ?? data.errorDetails?.message ?? data.error ?? res.statusText
        lastError = `ConnectSafely ${res.status}: ${msg}`
        if (attempt < MAX_SEND_RETRIES && isRetryableSendError(res.status, msg)) continue
        return { success: false, error: lastError }
      }

      return { success: true }
    } catch (err) {
      lastError = err instanceof Error ? err.message : 'Network error'
      if (attempt < MAX_SEND_RETRIES) continue
    }
  }

  return { success: false, error: lastError }
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

  const apiKey = getApiKey()

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
    return { status: 'failed', profile: null, error: `ConnectSafely ${res.status}: ${msg}` }
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
    company_name: null,
    industry: null,
    company_size: null,
    location: p.location ?? null,
  }

  if (Array.isArray(data.experience) && data.experience.length > 0) {
    const current = data.experience[0]
    profile.current_title = current.title ?? null
    profile.company_name = current.companyName ?? null
  }

  return { status: 'success', profile }
}
