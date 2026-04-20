export default function ActivationBanner() {
  return (
    <div className="mb-6 flex items-start gap-3 p-4 bg-green-50 border border-green-200 rounded-xl">
      <svg
        className="w-4 h-4 text-green-500 shrink-0 mt-0.5"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2}
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      <div>
        <p className="text-sm font-medium text-green-800">Account activated</p>
        <p className="text-xs text-green-700 mt-0.5">
          You can now save scoring models and reuse them on future uploads.
        </p>
      </div>
    </div>
  )
}
