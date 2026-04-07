import Papa from 'papaparse'

export interface ParsedCSV {
  headers: string[]
  rows: Record<string, string>[]
}

/**
 * Parse a CSV string into headers and row objects.
 * Uses papaparse with header detection and type inference disabled
 * so all values remain as strings (safe for LinkedIn URLs and mixed data).
 */
export function parseCSV(csvText: string): ParsedCSV {
  const result = Papa.parse<Record<string, string>>(csvText, {
    header: true,
    skipEmptyLines: true,
    dynamicTyping: false,
  })

  if (result.errors.length > 0) {
    const fatal = result.errors.find((e) => e.type === 'Quotes' || e.type === 'FieldMismatch')
    if (fatal) {
      throw new Error(`CSV parse error: ${fatal.message} (row ${fatal.row})`)
    }
  }

  const headers = result.meta.fields ?? []
  const rows = result.data

  return { headers, rows }
}

/**
 * Detect which column in a CSV most likely contains LinkedIn profile URLs.
 *
 * Strategy (in order of priority):
 * 1. Header name contains "linkedin", "profile", or "url" (case-insensitive)
 * 2. First data row value matches a linkedin.com URL pattern
 *
 * Returns the column header string, or null if no match is found.
 */
export function detectLinkedInColumn(
  headers: string[],
  firstRow: Record<string, string>
): string | null {
  const linkedinKeywords = ['linkedin', 'profile', 'url']

  // Pass 1: header name heuristic
  for (const header of headers) {
    const lower = header.toLowerCase()
    if (linkedinKeywords.some((kw) => lower.includes(kw))) {
      return header
    }
  }

  // Pass 2: scan first-row values for a linkedin.com URL pattern
  const linkedinPattern = /linkedin\.com\/(in|pub|company)\//i
  for (const header of headers) {
    const value = firstRow[header] ?? ''
    if (linkedinPattern.test(value)) {
      return header
    }
  }

  return null
}
