import { NextRequest, NextResponse } from 'next/server'
import { put } from '@vercel/blob'
import { z } from 'zod'
import { parseCSV, detectLinkedInColumn } from '@/app/lib/csv'

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const MAX_FILE_SIZE_BYTES = 500 * 1024 // 500 KB

const UploadSchema = z.object({
  file: z
    .instanceof(File)
    .refine((f) => f.size <= MAX_FILE_SIZE_BYTES, {
      message: `File must be under ${MAX_FILE_SIZE_BYTES / 1024} KB`,
    })
    .refine(
      (f) =>
        f.type === 'text/csv' ||
        f.type === 'application/vnd.ms-excel' ||
        f.name.endsWith('.csv'),
      { message: 'File must be a CSV' }
    ),
})

// ---------------------------------------------------------------------------
// Response shape
// ---------------------------------------------------------------------------

export interface UploadResponse {
  blob_url: string
  detected_linkedin_column: string | null
  column_names: string[]
  preview_rows: Record<string, string>[]
}

// ---------------------------------------------------------------------------
// POST /api/upload
//
// Accepts: multipart/form-data with a 'file' field containing a CSV.
//
// Steps:
//   1. Validate file size and MIME type via Zod
//   2. Parse CSV text with parseCSV() from lib/csv.ts
//   3. Detect LinkedIn URL column with detectLinkedInColumn()
//   4. Upload raw CSV to Vercel Blob for use in Phase 3 (/api/enrich)
//   5. Return blob_url, detected column, column names, and first 5 preview rows
//
// The blob_url is passed to /api/enrich in Phase 3 — it is the only persistent
// reference to the uploaded file during the enrichment pipeline.
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return NextResponse.json({ error: 'Invalid multipart form data' }, { status: 400 })
  }

  const file = formData.get('file')
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'Missing file field in form data' }, { status: 400 })
  }

  // Validate
  const validation = UploadSchema.safeParse({ file })
  if (!validation.success) {
    return NextResponse.json(
      { error: validation.error?.message ?? 'Invalid file' },
      { status: 422 }
    )
  }

  // Parse CSV
  const csvText = await file.text()
  let parsed: ReturnType<typeof parseCSV>
  try {
    parsed = parseCSV(csvText)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to parse CSV'
    return NextResponse.json({ error: message }, { status: 422 })
  }

  const { headers, rows } = parsed

  if (headers.length === 0) {
    return NextResponse.json({ error: 'CSV has no columns' }, { status: 422 })
  }

  // Detect LinkedIn column
  const firstRow = rows[0] ?? {}
  const detected_linkedin_column = detectLinkedInColumn(headers, firstRow)

  // Upload to Vercel Blob
  let blobResult: { url: string }
  try {
    // BLOB_READ_WRITE_TOKEN is the standard Vercel env var name; the SDK also
    // auto-picks it up if no explicit token is passed, but we read it here for
    // local dev where the var name may differ from the Vercel deployment default.
    blobResult = await put(`uploads/${Date.now()}-${file.name}`, file, {
      access: 'private',
      addRandomSuffix: true,
      token: process.env.BLOB_READ_WRITE_TOKEN ?? process.env.VERCEL_BLOB_TOKEN,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Blob upload failed'
    console.error('[upload] Vercel Blob upload failed:', message)
    return NextResponse.json({ error: 'Failed to store uploaded file' }, { status: 500 })
  }

  const response: UploadResponse = {
    blob_url: blobResult.url,
    detected_linkedin_column,
    column_names: headers,
    preview_rows: rows.slice(0, 5),
  }

  return NextResponse.json(response, { status: 200 })
}
