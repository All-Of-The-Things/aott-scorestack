import Papa from 'papaparse'

export interface ParsedCSV {
  headers: string[]
  rows: Record<string, string>[]
}

/**
 * Sanitize raw CSV text to handle common real-world encoding issues.
 * - Strips UTF-8 BOM (byte order mark) that Excel/Google Sheets may prepend
 * - Replaces curly/smart quotes with straight quotes (from copy-pasting from Word/Docs)
 * - Normalizes line endings to \n (handles \r\n from Windows and bare \r from old Mac)
 */
function sanitizeCSV(raw: string): string {
  return raw
    .replace(/^\uFEFF/, '')               // Strip BOM
    .replace(/[\u201C\u201D]/g, '"')      // Curly double quotes -> straight
    .replace(/[\u2018\u2019]/g, "'")      // Curly single quotes -> straight
    .replace(/\r\n/g, '\n')              // Windows CRLF -> LF
    .replace(/\r/g, '\n')               // Old Mac CR -> LF
}

/**
 * Parse a CSV string into headers and row objects.
 * Sanitizes the input first to handle real-world encoding quirks, then uses
 * papaparse with header detection and type inference disabled so all values
 * remain as strings (safe for LinkedIn URLs and mixed data).
 */
export function parseCSV(csvText: string): ParsedCSV {
  const cleaned = sanitizeCSV(csvText)
  const result = Papa.parse<Record<string, string>>(cleaned, {
    header: true,
    skipEmptyLines: true,
    dynamicTyping: false,
  })

  if (result.errors.length > 0) {
    const fatal = result.errors.find((e) => e.type === 'Quotes' || e.type === 'FieldMismatch')
    if (fatal) {
      const hint =
        fatal.type === 'Quotes'
          ? ' Check for unmatched quotes or multi-line fields that may not be properly quoted.'
          : ' Ensure all rows have the same number of columns as the header.'
      throw new Error(`CSV parse error: ${fatal.message} (row ${fatal.row}).${hint}`)
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
