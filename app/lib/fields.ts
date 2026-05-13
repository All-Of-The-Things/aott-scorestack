export const SENIORITY_LEVELS = [
  'Executive', 'VP', 'Director', 'Manager', 'Senior', 'Mid', 'Junior', 'Intern',
] as const

export type SeniorityLevel = typeof SENIORITY_LEVELS[number]

export const COMPANY_SIZE_BUCKETS = ['1-10', '11-50', '51-200', '201-500', '500+'] as const

export type CompanySizeBucket = typeof COMPANY_SIZE_BUCKETS[number]

export function bucketCompanySize(count: number): string {
  if (count <= 10) return '1-10'
  if (count <= 50) return '11-50'
  if (count <= 200) return '51-200'
  if (count <= 500) return '201-500'
  return '500+'
}

// Fields whose enriched values are a closed enumeration.
// Used by the criteria chip picker and badge rendering throughout the app.
export const FIELD_ALLOWED_VALUES: Partial<Record<string, readonly string[]>> = {
  seniority: SENIORITY_LEVELS,
  company_size: COMPANY_SIZE_BUCKETS,
}
