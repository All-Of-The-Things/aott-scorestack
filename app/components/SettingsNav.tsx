'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const BASE_TABS = [
  { href: '/settings/billing', label: 'Billing' },
  { href: '/settings/integrations', label: 'Integrations' },
]
const TEAM_TAB = { href: '/settings/team', label: 'Team' }

export default function SettingsNav({ showTeam = false }: { showTeam?: boolean }) {
  const pathname = usePathname()
  const tabs = showTeam ? [...BASE_TABS, TEAM_TAB] : BASE_TABS

  return (
    <div className="flex gap-1 border-b border-gray-200 mb-6">
      {tabs.map(({ href, label }) => {
        const active = pathname === href || pathname.startsWith(href + '/')
        return (
          <Link
            key={href}
            href={href}
            className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              active
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            {label}
          </Link>
        )
      })}
    </div>
  )
}
