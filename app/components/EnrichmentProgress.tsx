'use client'

interface EnrichmentSubmittedProps {
  notifyEmail: string
  onStartAnother: () => void
}

export default function EnrichmentSubmitted({ notifyEmail, onStartAnother }: EnrichmentSubmittedProps) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8 max-w-sm w-full mx-auto text-center">
      <div className="w-10 h-10 bg-green-50 rounded-full flex items-center justify-center mx-auto">
        <svg className="w-5 h-5 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
        </svg>
      </div>

      <h2 className="mt-4 text-sm font-semibold text-gray-800">Enrichment started</h2>
      <p className="mt-1.5 text-xs text-gray-500">
        We&apos;ll email{' '}
        <span className="font-medium text-gray-700">{notifyEmail}</span>{' '}
        when your results are ready.
      </p>

      <a
        href="/runs"
        className="mt-5 inline-block w-full py-2.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
      >
        View all enrichments →
      </a>

      <button
        onClick={onStartAnother}
        className="mt-3 block w-full text-xs text-gray-500 hover:text-gray-700 transition-colors"
      >
        Start another enrichment
      </button>
    </div>
  )
}
