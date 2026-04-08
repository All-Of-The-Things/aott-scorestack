'use client'

import {
  useState,
  useRef,
  useCallback,
  type DragEvent,
  type ChangeEvent,
} from 'react'
import type { UploadResponse } from '@/app/api/upload/route'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type UploadStep = 'idle' | 'uploading' | 'preview'

export interface ConfirmedUpload {
  blob_url: string
  linkedin_column: string
  original_filename: string
  column_names: string[]
}

interface UploadFormProps {
  /** Called when the user confirms the LinkedIn column and is ready to proceed. */
  onConfirmed: (data: ConfirmedUpload) => void
}

// ---------------------------------------------------------------------------
// UploadForm
//
// Three-step client component:
//   1. idle    — drag-and-drop zone / file picker
//   2. uploading — spinner while POST /api/upload is in-flight
//   3. preview  — column preview table + LinkedIn column selector + confirm CTA
//
// On confirm, calls props.onConfirmed with { blob_url, linkedin_column,
// original_filename, column_names }. The parent (app/page.tsx) passes this
// to <EnrichmentProgress /> in Phase 3.
// ---------------------------------------------------------------------------

export default function UploadForm({ onConfirmed }: UploadFormProps) {
  const [step, setStep] = useState<UploadStep>('idle')
  const [isDragging, setIsDragging] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [uploadData, setUploadData] = useState<UploadResponse | null>(null)
  const [selectedColumn, setSelectedColumn] = useState<string>('')
  const [filename, setFilename] = useState<string>('')

  const fileInputRef = useRef<HTMLInputElement>(null)

  // ---------------------------------------------------------------------------
  // Core upload logic
  // ---------------------------------------------------------------------------

  const uploadFile = useCallback(async (file: File) => {
    setError(null)
    setStep('uploading')
    setFilename(file.name)

    const formData = new FormData()
    formData.append('file', file)

    try {
      const res = await fetch('/api/upload', { method: 'POST', body: formData })
      const json = await res.json()

      if (!res.ok) {
        throw new Error(json.error ?? `Upload failed (${res.status})`)
      }

      const data = json as UploadResponse
      setUploadData(data)
      // Pre-select auto-detected column, fall back to first column
      setSelectedColumn(data.detected_linkedin_column ?? data.column_names[0] ?? '')
      setStep('preview')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.')
      setStep('idle')
    }
  }, [])

  // ---------------------------------------------------------------------------
  // Event handlers
  // ---------------------------------------------------------------------------

  const handleFileInput = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) uploadFile(file)
  }

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) uploadFile(file)
  }

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setIsDragging(true)
  }

  const handleDragLeave = () => setIsDragging(false)

  const handleConfirm = () => {
    if (!uploadData || !selectedColumn) return
    onConfirmed({
      blob_url: uploadData.blob_url,
      linkedin_column: selectedColumn,
      original_filename: filename,
      column_names: uploadData.column_names,
    })
  }

  const reset = () => {
    setStep('idle')
    setUploadData(null)
    setSelectedColumn('')
    setError(null)
    setFilename('')
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  // ---------------------------------------------------------------------------
  // Render: idle + uploading
  // ---------------------------------------------------------------------------

  if (step === 'idle' || step === 'uploading') {
    return (
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
        {/* Drop zone */}
        <div
          role="button"
          tabIndex={0}
          aria-label="Upload CSV file"
          className={[
            'border-2 border-dashed rounded-xl p-12 text-center transition-colors',
            isDragging
              ? 'border-blue-400 bg-blue-50'
              : 'border-gray-300 hover:border-gray-400 hover:bg-gray-50/50',
            step === 'uploading'
              ? 'opacity-60 pointer-events-none cursor-not-allowed'
              : 'cursor-pointer',
          ].join(' ')}
          onClick={() => step !== 'uploading' && fileInputRef.current?.click()}
          onKeyDown={(e) => e.key === 'Enter' && fileInputRef.current?.click()}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={handleFileInput}
          />

          {step === 'uploading' ? (
            <div className="flex flex-col items-center gap-3">
              <div className="w-8 h-8 border-[3px] border-blue-500 border-t-transparent rounded-full animate-spin" />
              <p className="text-sm text-gray-500">
                Uploading <span className="font-medium text-gray-700">{filename}</span>…
              </p>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3">
              {/* Upload icon */}
              <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center">
                <svg
                  className="w-5 h-5 text-gray-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={1.5}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"
                  />
                </svg>
              </div>

              <div>
                <p className="text-sm font-medium text-gray-700">
                  Drop your CSV here{' '}
                  <span className="text-gray-400 font-normal">or</span>{' '}
                  <span className="text-blue-600 hover:underline">click to browse</span>
                </p>
                <p className="mt-1 text-xs text-gray-400">Max 500 KB · .csv files only</p>
                <p className="mt-2 text-xs text-gray-400">
                  Not sure about the format?{' '}
                  <a
                    href="/example.csv"
                    download="example.csv"
                    className="text-blue-500 hover:text-blue-600 hover:underline"
                    onClick={(e) => e.stopPropagation()}
                  >
                    Download an example CSV
                  </a>
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Error */}
        {error && (
          <div className="mt-4 flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
            <svg
              className="w-4 h-4 text-red-500 shrink-0 mt-0.5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
              />
            </svg>
            <div className="flex-1 min-w-0">
              <p className="text-sm text-red-600">{error}</p>
              {error.toLowerCase().includes('csv') && (
                <p className="text-xs text-red-500 mt-1">
                  Make sure your CSV follows standard formatting.{' '}
                  <a
                    href="/example.csv"
                    download="example.csv"
                    className="text-red-600 underline hover:text-red-700"
                    onClick={(e) => e.stopPropagation()}
                  >
                    Download an example CSV
                  </a>{' '}
                  to see the expected format.
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    )
  }

  // ---------------------------------------------------------------------------
  // Render: preview
  // ---------------------------------------------------------------------------

  if (!uploadData) return null

  const isAutoDetected =
    uploadData.detected_linkedin_column !== null &&
    selectedColumn === uploadData.detected_linkedin_column

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
      {/* Header bar */}
      <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-gray-800 truncate">{filename}</p>
          <p className="text-xs text-gray-400 mt-0.5">
            {uploadData.column_names.length} columns ·{' '}
            {uploadData.preview_rows.length} preview row
            {uploadData.preview_rows.length !== 1 ? 's' : ''}
          </p>
        </div>
        <button
          onClick={reset}
          className="ml-4 shrink-0 text-xs text-gray-400 hover:text-gray-600 transition-colors"
        >
          ← Upload different file
        </button>
      </div>

      {/* Column preview table */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-100">
              {uploadData.column_names.map((col) => (
                <th
                  key={col}
                  className={[
                    'px-4 py-3 text-left font-medium whitespace-nowrap select-none',
                    col === selectedColumn
                      ? 'text-blue-700 bg-blue-50'
                      : 'text-gray-500',
                  ].join(' ')}
                >
                  {col === selectedColumn && (
                    <span className="inline-block w-1.5 h-1.5 rounded-full bg-blue-500 mr-1.5 mb-px" />
                  )}
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {uploadData.preview_rows.map((row, i) => (
              <tr
                key={i}
                className="border-b border-gray-50 last:border-0 hover:bg-gray-50/40 transition-colors"
              >
                {uploadData.column_names.map((col) => (
                  <td
                    key={col}
                    title={row[col] ?? ''}
                    className={[
                      'px-4 py-2.5 whitespace-nowrap max-w-[220px] truncate',
                      col === selectedColumn
                        ? 'bg-blue-50/50 text-blue-800 font-medium'
                        : 'text-gray-600',
                    ].join(' ')}
                  >
                    {row[col] || <span className="text-gray-300">—</span>}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Footer: column selector + confirm CTA */}
      <div className="px-6 py-4 bg-gray-50/60 border-t border-gray-100 flex flex-col sm:flex-row sm:items-center gap-4">
        <div className="flex-1 min-w-0">
          <label
            htmlFor="linkedin-column-select"
            className="block text-xs font-medium text-gray-500 mb-1.5"
          >
            LinkedIn URL column
          </label>

          <div className="flex items-center gap-2 flex-wrap">
            <select
              id="linkedin-column-select"
              value={selectedColumn}
              onChange={(e) => setSelectedColumn(e.target.value)}
              className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-shadow"
            >
              {uploadData.column_names.map((col) => (
                <option key={col} value={col}>
                  {col}
                </option>
              ))}
            </select>

            {isAutoDetected && (
              <span className="inline-flex items-center gap-1 text-xs text-green-700 font-medium bg-green-50 border border-green-100 px-2 py-1 rounded-md">
                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                  <path
                    fillRule="evenodd"
                    d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                    clipRule="evenodd"
                  />
                </svg>
                Auto-detected
              </span>
            )}

            {!uploadData.detected_linkedin_column && (
              <span className="text-xs text-amber-600 bg-amber-50 border border-amber-100 px-2 py-1 rounded-md">
                No LinkedIn column detected — please select one
              </span>
            )}
          </div>
        </div>

        <button
          onClick={handleConfirm}
          disabled={!selectedColumn}
          className="shrink-0 inline-flex items-center gap-2 px-5 py-2 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white text-sm font-medium rounded-lg disabled:opacity-40 disabled:cursor-not-allowed transition-colors shadow-sm"
        >
          Confirm & Enrich
          <svg
            className="w-4 h-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
          </svg>
        </button>
      </div>
    </div>
  )
}
