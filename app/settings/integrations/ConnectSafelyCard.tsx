'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface Props {
  isAdmin: boolean
  isPro: boolean
  connected: boolean
  verifiedAt: string | null
  lastError: string | null
}

export default function ConnectSafelyCard({ isAdmin, isPro, connected, verifiedAt, lastError }: Props) {
  const router = useRouter()
  const [modalOpen, setModalOpen] = useState(false)
  const [disconnectOpen, setDisconnectOpen] = useState(false)
  const [apiKey, setApiKey] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleConnect() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/org/integrations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ connectSafelyApiKey: apiKey }),
      })
      const data = await res.json() as { error?: string; detail?: string }
      if (!res.ok) {
        setError(data.detail ?? data.error ?? 'Failed to connect')
        return
      }
      setModalOpen(false)
      setApiKey('')
      router.refresh()
    } catch {
      setError('Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  async function handleDisconnect() {
    setLoading(true)
    try {
      await fetch('/api/org/integrations', { method: 'DELETE' })
      setDisconnectOpen(false)
      router.refresh()
    } catch {
      // silent — page refresh will show correct state anyway
    } finally {
      setLoading(false)
    }
  }

  const formattedDate = verifiedAt
    ? new Date(verifiedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : null

  return (
    <>
      <div className="bg-white border border-gray-200 rounded-2xl p-6">
        <div className="flex items-start justify-between gap-4 mb-5">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center shrink-0">
              <svg className="w-5 h-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-900">ConnectSafely</p>
              <p className="text-xs text-gray-500">LinkedIn message delivery</p>
            </div>
          </div>

          {connected ? (
            <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700 bg-green-50 border border-green-200 px-2.5 py-1 rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
              Connected
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-xs font-medium text-gray-500 bg-gray-50 border border-gray-200 px-2.5 py-1 rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-gray-300" />
              Not connected
            </span>
          )}
        </div>

        {/* Error banner */}
        {connected && lastError && (
          <div className="mb-4 flex items-start gap-2.5 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5">
            <svg className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
            </svg>
            <div>
              <p className="text-xs font-medium text-amber-800">LinkedIn connection issue</p>
              <p className="text-xs text-amber-700 mt-0.5">{lastError}</p>
            </div>
          </div>
        )}

        {connected ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between text-xs text-gray-500 bg-gray-50 rounded-lg px-3 py-2.5">
              <span className="font-mono tracking-wide text-gray-400">cs_••••••••••••••••</span>
              {formattedDate && <span>Connected {formattedDate}</span>}
            </div>

            {isAdmin ? (
              <div className="flex gap-2">
                <button
                  onClick={() => { setModalOpen(true); setError(null); setApiKey('') }}
                  className="flex-1 py-2 text-xs font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors"
                >
                  {lastError ? 'Reconnect' : 'Replace key'}
                </button>
                <button
                  onClick={() => setDisconnectOpen(true)}
                  className="flex-1 py-2 text-xs font-medium text-red-600 bg-red-50 hover:bg-red-100 rounded-lg transition-colors"
                >
                  Disconnect
                </button>
              </div>
            ) : (
              <p className="text-xs text-gray-400">Managed by your account admin.</p>
            )}
          </div>
        ) : (
          <div>
            <p className="text-xs text-gray-500 mb-3">
              Messages are sent from the <span className="font-medium text-gray-700">ScoreStack outreach agent</span>.
              Connect your own account to send from your LinkedIn profile.
            </p>
            {isAdmin && isPro ? (
              <button
                onClick={() => { setModalOpen(true); setError(null); setApiKey('') }}
                className="w-full py-2.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
              >
                Connect your account
              </button>
            ) : isAdmin && !isPro ? (
              <div className="flex items-center gap-2 text-xs text-gray-400 bg-gray-50 border border-gray-100 rounded-lg px-3 py-2.5">
                <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
                </svg>
                BYOK requires the Pro plan
              </div>
            ) : (
              <p className="text-xs text-gray-400">Managed by your account admin.</p>
            )}
          </div>
        )}
      </div>

      {/* Connect modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => !loading && setModalOpen(false)} />
          <div className="relative w-full max-w-sm bg-white rounded-2xl shadow-xl p-6">
            <h2 className="text-sm font-semibold text-gray-900 mb-1">Connect ConnectSafely</h2>
            <p className="text-xs text-gray-500 mb-4">
              Enter your ConnectSafely API key. We&apos;ll validate it before saving.
            </p>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="cs_••••••••••••••••"
              disabled={loading}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-60 font-mono mb-3"
            />
            {error && (
              <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2 mb-3">{error}</p>
            )}
            <div className="flex gap-2">
              <button
                onClick={() => !loading && setModalOpen(false)}
                disabled={loading}
                className="flex-1 py-2 text-xs font-medium text-gray-500 hover:text-gray-700 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleConnect}
                disabled={loading || !apiKey.trim()}
                className="flex-1 py-2 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-50"
              >
                {loading ? 'Validating…' : 'Connect'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Disconnect confirmation */}
      {disconnectOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => !loading && setDisconnectOpen(false)} />
          <div className="relative w-full max-w-sm bg-white rounded-2xl shadow-xl p-6">
            <h2 className="text-sm font-semibold text-gray-900 mb-1">Disconnect ConnectSafely?</h2>
            <p className="text-xs text-gray-500 mb-5">
              Future delivery jobs will be sent from the ScoreStack outreach agent instead.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => !loading && setDisconnectOpen(false)}
                disabled={loading}
                className="flex-1 py-2 text-xs font-medium text-gray-500 hover:text-gray-700 transition-colors disabled:opacity-50"
              >
                Keep connected
              </button>
              <button
                onClick={handleDisconnect}
                disabled={loading}
                className="flex-1 py-2 text-xs font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors disabled:opacity-50"
              >
                {loading ? 'Disconnecting…' : 'Disconnect'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
