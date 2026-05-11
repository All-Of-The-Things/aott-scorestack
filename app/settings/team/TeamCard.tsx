'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface Member {
  id: string
  email: string
  name: string | null
  role: 'admin' | 'member'
  createdAt: string
}

interface PendingInvite {
  id: string
  email: string
  role: 'admin' | 'member'
  createdAt: string
}

interface Props {
  currentUserId: string
  isAdmin: boolean
  members: Member[]
  pendingInvites: PendingInvite[]
  memberLimit: number
}

const ROLE_BADGE: Record<string, string> = {
  admin:  'text-purple-700 bg-purple-50 border border-purple-100',
  member: 'text-gray-600 bg-gray-50 border border-gray-200',
}

export default function TeamCard({
  currentUserId, isAdmin, members, pendingInvites, memberLimit,
}: Props) {
  const router = useRouter()
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<'member' | 'admin'>('member')
  const [sending, setSending] = useState(false)
  const [removing, setRemoving] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const seatsUsed = members.length
  const atLimit = seatsUsed >= memberLimit

  async function handleInvite() {
    if (!inviteEmail.trim()) return
    setSending(true)
    setError(null)
    try {
      const res = await fetch('/api/org/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: inviteEmail.trim(), role: inviteRole }),
      })
      const data = await res.json() as { error?: string; limit?: number }
      if (!res.ok) {
        if (data.error === 'seat_limit_reached') {
          setError(`Member limit reached (${data.limit} maximum).`)
        } else if (data.error === 'already_member') {
          setError('This person is already a member of your workspace.')
        } else {
          setError(data.error ?? 'Failed to send invite')
        }
        return
      }
      setInviteEmail('')
      setInviteRole('member')
      router.refresh()
    } catch {
      setError('Something went wrong')
    } finally {
      setSending(false)
    }
  }

  async function handleRemove(userId: string) {
    setRemoving(userId)
    try {
      await fetch(`/api/org/members/${userId}`, { method: 'DELETE' })
      router.refresh()
    } finally {
      setRemoving(null)
    }
  }

  return (
    <>
      <div className="bg-white border border-gray-200 rounded-2xl p-6 space-y-6">

        {/* Seat counter */}
        <div className="flex items-center justify-between text-xs text-gray-500 bg-gray-50 rounded-lg px-3 py-2">
          <span>Members</span>
          <span className={`font-semibold ${atLimit ? 'text-amber-600' : 'text-gray-700'}`}>
            {seatsUsed} / {memberLimit}
          </span>
        </div>

        {/* Members table */}
        <div>
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Members</h2>
          <div className="space-y-1">
            {members.map((m) => (
              <div key={m.id} className="flex items-center justify-between gap-3 py-2 border-b border-gray-50 last:border-0">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">{m.name ?? m.email}</p>
                  {m.name && <p className="text-xs text-gray-400 truncate">{m.email}</p>}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full capitalize ${ROLE_BADGE[m.role]}`}>
                    {m.role}
                  </span>
                  {isAdmin && m.id !== currentUserId && (
                    <button
                      onClick={() => handleRemove(m.id)}
                      disabled={removing === m.id}
                      className="text-xs text-red-500 hover:text-red-700 transition-colors disabled:opacity-40"
                    >
                      {removing === m.id ? 'Removing…' : 'Remove'}
                    </button>
                  )}
                  {m.id === currentUserId && (
                    <span className="text-[10px] text-gray-400">You</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Pending invites */}
        {pendingInvites.length > 0 && (
          <div>
            <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Pending invites</h2>
            <div className="space-y-1">
              {pendingInvites.map((inv) => (
                <div key={inv.id} className="flex items-center justify-between gap-3 py-2 border-b border-gray-50 last:border-0">
                  <p className="text-sm text-gray-600 truncate">{inv.email}</p>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full capitalize ${ROLE_BADGE[inv.role]}`}>
                      {inv.role}
                    </span>
                    <span className="text-xs text-gray-400">
                      Sent {new Date(inv.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Invite section */}
        <div className="border-t border-gray-100 pt-5">
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Invite teammate</h2>

          {!isAdmin ? (
            <p className="text-xs text-gray-400">Team management is available to admins only.</p>
          ) : (
            <div className="space-y-3">
              <div className="flex gap-2">
                <input
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleInvite()}
                  placeholder="colleague@company.com"
                  disabled={sending}
                  className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-60"
                />
                <select
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value as 'member' | 'admin')}
                  disabled={sending}
                  className="px-2 py-2 text-xs border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-60"
                >
                  <option value="member">Member</option>
                  <option value="admin">Admin</option>
                </select>
              </div>

              {error && (
                <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>
              )}

              <button
                onClick={handleInvite}
                disabled={sending || !inviteEmail.trim()}
                className="w-full py-2.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-50"
              >
                {sending ? 'Sending invite…' : 'Send invite'}
              </button>
            </div>
          )}
        </div>
      </div>

    </>
  )
}
