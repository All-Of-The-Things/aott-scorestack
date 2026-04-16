'use client'

import { useState } from 'react'

interface EnrichmentChoiceProps {
  filename: string
  onStartNow: () => void
  onNotifyMe: (email: string) => void
  /** Pre-fill the notify email input with the signed-in user's address. */
  initialEmail?: string
}

// Shown between upload confirmation and enrichment start.
// Lets the user decide upfront whether to wait on the page or leave and be notified.
export default function EnrichmentChoice({ filename, onStartNow, onNotifyMe, initialEmail }: EnrichmentChoiceProps) {
  const [selected, setSelected] = useState<'wait' | 'notify' | null>(null)
  const [email, setEmail] = useState(initialEmail ?? '')

  const handleNotifySubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (email.trim()) onNotifyMe(email.trim())
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden max-w-lg w-full mx-auto">
      {/* File header */}
      <div className="px-6 py-4 border-b border-gray-100">
        <p className="text-sm font-semibold text-gray-800 truncate">{filename}</p>
        <p className="text-xs text-gray-400 mt-0.5">Ready to enrich — how would you like to proceed?</p>
      </div>

      <div className="p-4 flex flex-col gap-3">
        {/* Option: Wait here */}
        <button
          type="button"
          onClick={() => { setSelected('wait'); onStartNow() }}
          className={[
            'w-full text-left px-4 py-4 rounded-xl border-2 transition-colors',
            selected === 'wait'
              ? 'border-blue-500 bg-blue-50'
              : 'border-gray-100 hover:border-gray-200 bg-gray-50/60',
          ].join(' ')}
        >
          <p className="text-sm font-medium text-gray-800">Wait here</p>
          <p className="text-xs text-gray-500 mt-0.5">
            Stay on this page and watch enrichment progress in real time.
          </p>
        </button>

        {/* Option: Notify me */}
        <div
          className={[
            'w-full rounded-xl border-2 transition-colors overflow-hidden',
            selected === 'notify'
              ? 'border-blue-500 bg-blue-50'
              : 'border-gray-100 bg-gray-50/60',
          ].join(' ')}
        >
          <button
            type="button"
            onClick={() => setSelected(selected === 'notify' ? null : 'notify')}
            className="w-full text-left px-4 py-4"
          >
            <p className="text-sm font-medium text-gray-800">Notify me by email</p>
            <p className="text-xs text-gray-500 mt-0.5">
              Start enrichment in the background — close this tab and get a link when results are ready.
            </p>
          </button>

          {selected === 'notify' && (
            <form onSubmit={handleNotifySubmit} className="px-4 pb-4 flex gap-2">
              <input
                type="email"
                required
                autoFocus
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="flex-1 min-w-0 text-sm px-3 py-2 border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <button
                type="submit"
                disabled={!email.trim()}
                className="shrink-0 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg disabled:opacity-50 transition-colors"
              >
                Start &amp; notify
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
