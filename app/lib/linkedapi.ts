export interface LinkedInProfile {
  linkedin_url: string
  first_name: string | null
  last_name: string | null
  full_name: string | null
  headline: string | null
  current_title: string | null
  seniority: string | null
  company_name: string | null
  industry: string | null
  company_size: string | null
  location: string | null
}

export interface FetchProfileResult {
  status: 'success' | 'failed' | 'skipped'
  profile: LinkedInProfile | null
  error?: string
}

const LINKEDAPI_BASE = 'https://api.linkedapi.io/v1'
const RETRY_DELAY_MS = 2000

/**
 * Fetch a LinkedIn profile via LinkedAPI by profile URL.
 *
 * Retry policy: on HTTP 429 (rate limit), wait RETRY_DELAY_MS and retry once.
 * Any other non-200 response (or network error) is returned as status: 'failed'.
 *
 * Requires LINKEDAPI_KEY env var.
 */
export async function fetchProfile(linkedinUrl: string): Promise<FetchProfileResult> {
  if (!linkedinUrl || !linkedinUrl.includes('linkedin.com')) {
    return { status: 'skipped', profile: null, error: 'Invalid or missing LinkedIn URL' }
  }

  const apiKey = process.env.LINKEDAPI_KEY
  if (!apiKey) {
    throw new Error('LINKEDAPI_KEY environment variable is not set')
  }

  const attempt = async (): Promise<Response> => {
    return fetch(`${LINKEDAPI_BASE}/profile`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ url: linkedinUrl }),
    })
  }

  let res: Response

  try {
    res = await attempt()

    // Retry once on rate limit
    if (res.status === 429) {
      await sleep(RETRY_DELAY_MS)
      res = await attempt()
    }
  } catch (err) {
    return {
      status: 'failed',
      profile: null,
      error: err instanceof Error ? err.message : 'Network error',
    }
  }

  if (!res.ok) {
    return {
      status: 'failed',
      profile: null,
      error: `LinkedAPI returned ${res.status}: ${res.statusText}`,
    }
  }

  try {
    const raw = await res.json()
    const profile: LinkedInProfile = {
      linkedin_url: linkedinUrl,
      first_name: raw.firstName ?? raw.first_name ?? null,
      last_name: raw.lastName ?? raw.last_name ?? null,
      full_name: raw.fullName ?? raw.full_name ?? raw.name ?? null,
      headline: raw.headline ?? null,
      current_title: raw.position ?? raw.currentPosition ?? raw.title ?? null,
      seniority: raw.seniority ?? null,
      company_name: raw.company ?? raw.currentCompany ?? raw.companyName ?? null,
      industry: raw.industry ?? null,
      company_size: raw.companySize ?? raw.company_size ?? null,
      location: raw.location ?? raw.geo ?? null,
    }
    return { status: 'success', profile }
  } catch {
    return {
      status: 'failed',
      profile: null,
      error: 'Failed to parse LinkedAPI response',
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
