import LinkedApi, { LinkedApiError } from '@linkedapi/node'
import { enrichMock } from '../mocks/enrich'
import { fetchProfile as csFetchProfile, deriveSeniority } from './connectsafely'
import { bucketCompanySize } from './fields'

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
  company_size: string | null   // bracket range, e.g. '51-200'
  employee_count: string | null // raw count, e.g. '150'
  location: string | null
}

export interface FetchProfileResult {
  status: 'success' | 'failed' | 'skipped'
  profile: LinkedInProfile | null
  error?: string
}

// ---------------------------------------------------------------------------
// SDK client — singleton, initialised on first use.
// Requires LINKED_API_TOKEN and LINKED_API_ID_TOKEN env vars.
// ---------------------------------------------------------------------------

let _client: LinkedApi | null = null

export function getClient(): LinkedApi {
  if (_client) return _client

  const linkedApiToken = process.env.LINKED_API_TOKEN
  const identificationToken = process.env.LINKED_API_ID_TOKEN

  if (!linkedApiToken || !identificationToken) {
    throw new Error(
      'LINKED_API_TOKEN and LINKED_API_ID_TOKEN environment variables must be set'
    )
  }

  _client = new LinkedApi({ linkedApiToken, identificationToken })
  return _client
}

// ---------------------------------------------------------------------------
// fetchProfile — uses the @linkedapi/node SDK's fetchPerson operation.
//
// The SDK uses an async workflow pattern:
//   1. execute() starts the workflow and returns a workflowId
//   2. result(workflowId) polls until the workflow completes
//
// We request experience data so we can derive richer profile info.
// The SDK handles auth, retries, and polling internally.
// ---------------------------------------------------------------------------

export async function fetchProfile(linkedinUrl: string): Promise<FetchProfileResult> {
  if (process.env.CONNECT_SAFELY_ENRICHMENT_ENABLED === 'true') {
    return csFetchProfile(linkedinUrl)
  }

  if (process.env.LINKED_API_ENABLED !== 'true') {
    return {
      status: 'success',
      profile: enrichMock(),
    };
  }

  if (!linkedinUrl || !linkedinUrl.includes('linkedin.com')) {
    return { status: 'skipped', profile: null, error: 'Invalid or missing LinkedIn URL' }
  }

  try {
    const client = getClient()
    const workflowId = await client.fetchPerson.execute({
      personUrl: linkedinUrl,
      retrieveExperience: true,
    })

    const personResult = await client.fetchPerson.result(workflowId)

    if (personResult.errors.length > 0) {
      const errorMsg = personResult.errors.map((e) => JSON.stringify(e)).join('; ')
      return { status: 'failed', profile: null, error: `LinkedAPI errors: ${errorMsg}` }
    }

    if (!personResult.data) {
      return { status: 'failed', profile: null, error: 'No data returned from LinkedAPI' }
    }

    const person = personResult.data
    const nameParts = (person.name ?? '').split(' ')

    const profile: LinkedInProfile = {
      linkedin_url: linkedinUrl,
      first_name: nameParts[0] || null,
      last_name: nameParts.length > 1 ? nameParts.slice(1).join(' ') : null,
      full_name: person.name || null,
      headline: person.headline || null,
      current_title: person.position || null,
      seniority: deriveSeniority(person.position || null),
      company_name: person.companyName || null,
      industry: null,
      company_size: null,
      employee_count: null,
      location: person.location || null,
    }

    if (person.companyHashedUrl) {
      try {
        const companyWorkflowId = await client.fetchCompany.execute({
          companyUrl: person.companyHashedUrl,
        })
        const companyResult = await client.fetchCompany.result(companyWorkflowId)
        if (companyResult.errors.length === 0 && companyResult.data) {
          const co = companyResult.data
          profile.industry = co.industry || null
          if (co.employeesCount != null) {
            profile.company_size = bucketCompanySize(co.employeesCount)
            profile.employee_count = String(co.employeesCount)
          }
        }
      } catch (coErr) {
        console.warn('[linkedapi] fetchCompany failed for', person.companyHashedUrl, coErr)
      }
    }

    return { status: 'success', profile }
  } catch (err) {
    console.error('[linkedapi] fetchPerson failed for', linkedinUrl, err)
    if (err instanceof LinkedApiError) {
      return {
        status: 'failed',
        profile: null,
        error: `LinkedAPI error: ${err.message}`,
      }
    }
    return {
      status: 'failed',
      profile: null,
      error: err instanceof Error ? err.message : 'Unknown error',
    }
  }
}
