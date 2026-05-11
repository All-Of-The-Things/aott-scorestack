import { redirect } from 'next/navigation'
import { auth } from '@/app/lib/auth'
import prisma from '@/app/lib/prisma'
import AppHeader from '@/app/components/AppHeader'
import SettingsNav from '@/app/components/SettingsNav'
import TeamCard from './TeamCard'

export default async function TeamPage() {
  if (process.env.TEAMS_ENABLED !== 'true') redirect('/settings/billing')

  const session = await auth()
  if (!session) redirect('/auth/signin?callbackUrl=/settings/team')

  const { orgId, plan, role, email, id: userId } = session.user
  if (!orgId) redirect('/')

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
        <SettingsNav showTeam />

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
