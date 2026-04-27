function deriveHeaders(rows: { enrichedData: Record<string, unknown> | null }[]): string[] {
  const base = ['linkedin_url', 'total_score']
  for (const r of rows) {
    if (r.enrichedData && typeof r.enrichedData === 'object') {
      // Exclude keys already present in base to avoid duplicate columns
      // (LinkedInProfile includes linkedin_url which would otherwise appear twice)
      const extra = Object.keys(r.enrichedData).filter((k) => !base.includes(k))
      return [...base, ...extra]
    }
  }
  return base
}

function escapeCell(val: unknown): string {
  const s = val === null || val === undefined ? '' : String(val)
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}

export interface ExportRow {
  linkedinUrl: string
  totalScore: number | null
  enrichedData: Record<string, unknown> | null
}

export function buildCsvContent(rows: ExportRow[]): string {
  const headers = deriveHeaders(rows)
  const lines: string[] = [headers.join(',')]
  for (const row of rows) {
    const data = row.enrichedData ?? {}
    const cells = headers.map((h) => {
      if (h === 'linkedin_url') return escapeCell(row.linkedinUrl)
      if (h === 'total_score') return escapeCell(row.totalScore)
      return escapeCell(data[h])
    })
    lines.push(cells.join(','))
  }
  return lines.join('\n')
}
