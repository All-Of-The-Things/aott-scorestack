import { redirect } from 'next/navigation'
import { auth } from '@/app/lib/auth'
import prisma from '@/app/lib/prisma'
import AppHeader from '@/app/components/AppHeader'
import SettingsNav from '@/app/components/SettingsNav'
import TeamCard from './TeamCard'
import UpgradePlanButton from '@/app/components/UpgradePlanButton'

const PRO_VARIANT_ID = process.env.NEXT_PUBLIC_LEMONSQUEEZY_PRO_VARIANT_ID ?? ''

export default async function TeamPage() {
  const session = await auth()
  if (!session) redirect('/auth/signin?callbackUrl=/settings/team')

  const { orgId, plan, role, email, id: userId } = session.user
  if (!orgId) redirect('/')

  const isPro = plan === 'pro' || plan === 'enterprise'

  if (!isPro) {
    return (
      <div className="min-h-screen bg-gray-50">
        <AppHeader userEmail={email} plan={plan} />
        <main className="max-w-2xl mx-auto px-4 py-10">
          <SettingsNav />
          <div className="space-y-6">
            <div>
              <h1 className="text-lg font-semibold text-gray-900">Team</h1>
              <p className="text-sm text-gray-500 mt-1">Manage who has access to your ScoreStack workspace.</p>
            </div>
            <div className="bg-white border border-gray-200 rounded-2xl p-8 text-center">
              <div className="w-12 h-12 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-6 h-6 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
                </svg>
              </div>
              <h3 className="text-sm font-semibold text-gray-900 mb-1">Teams — Pro feature</h3>
              <p className="text-xs text-gray-500 max-w-xs mx-auto mb-5">
                Invite teammates to collaborate on enrichments and scoring models. Available on the Pro plan.
              </p>
              <UpgradePlanButton variantId={PRO_VARIANT_ID} label="Upgrade to Pro" />
            </div>
          </div>
        </main>
      </div>
    )
  }

  const memberLimit = parseInt(process.env.TEAMS_MEMBER_LIMIT ?? '3', 10)

  const [members, invites] = await Promise.all([
    prisma.user.findMany({
      where: { orgId },
      select: { id: true, email: true, name: true, role: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.orgInvite.findMany({
      where: { orgId, expires: { gte: new Date() } },
      select: { id: true, email: true, role: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    }),
  ])

  const isAdmin = role === 'admin'

  return (
    <div className="min-h-screen bg-gray-50">
      <AppHeader userEmail={email} plan={plan} />

      <main className="max-w-2xl mx-auto px-4 py-10">
        <SettingsNav />

        <div className="space-y-6">
          <div>
            <h1 className="text-lg font-semibold text-gray-900">Team</h1>
            <p className="text-sm text-gray-500 mt-1">
              Manage who has access to your ScoreStack workspace.
            </p>
          </div>

          <TeamCard
            currentUserId={userId}
            isAdmin={isAdmin}
            members={members.map((m) => ({
              id: m.id,
              email: m.email ?? '',
              name: m.name ?? null,
              role: m.role,
              createdAt: m.createdAt.toISOString(),
            }))}
            pendingInvites={invites.map((i) => ({
              id: i.id,
              email: i.email,
              role: i.role,
              createdAt: i.createdAt.toISOString(),
            }))}
            memberLimit={memberLimit}
          />
        </div>
      </main>
    </div>
  )
}
