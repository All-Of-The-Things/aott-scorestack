import { redirect } from 'next/navigation'
import { auth } from '@/app/lib/auth'
import prisma from '@/app/lib/prisma'
import AppHeader from '@/app/components/AppHeader'
import SettingsNav from '@/app/components/SettingsNav'
import ConnectSafelyCard from './ConnectSafelyCard'

export default async function IntegrationsPage() {
  const session = await auth()
  if (!session) redirect('/auth/signin?callbackUrl=/settings/integrations')

  const { orgId, plan, role, email } = session.user
  if (!orgId) redirect('/')

  const isPro = plan === 'pro' || plan === 'enterprise'
  const isAdmin = role === 'admin'

  const integration = await prisma.orgIntegration.findUnique({
    where: { orgId },
    select: {
      connectSafelyApiKey: true,
      connectSafelyVerifiedAt: true,
      connectSafelyLastError: true,
    },
  })

  return (
    <div className="min-h-screen bg-gray-50">
      <AppHeader
        userEmail={email}
        plan={plan}
      />

      <main className="max-w-2xl mx-auto px-4 py-10">
        <SettingsNav showTeam={process.env.TEAMS_ENABLED === 'true'} />

        <div className="space-y-6">
          <div>
            <h1 className="text-lg font-semibold text-gray-900">Integrations</h1>
            <p className="text-sm text-gray-500 mt-1">
              Connect your own accounts to send LinkedIn messages from your profile.
            </p>
          </div>

          <ConnectSafelyCard
            isAdmin={isAdmin}
            isPro={isPro}
            connected={!!integration?.connectSafelyApiKey}
            verifiedAt={integration?.connectSafelyVerifiedAt?.toISOString() ?? null}
            lastError={integration?.connectSafelyLastError ?? null}
          />
        </div>
      </main>
    </div>
  )
}
