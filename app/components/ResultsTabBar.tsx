'use client'

import Link from 'next/link'

interface Props {
  runId: string
  activeTab: string
}

const TABS = [
  { key: 'scores', label: 'Scores' },
  { key: 'messages', label: 'Messages' },
]

export default function ResultsTabBar({ runId, activeTab }: Props) {
  return (
    <div className="flex gap-1 mb-6 border-b border-gray-200">
      {TABS.map((tab) => {
        const isActive = activeTab === tab.key
        const href = `/run/${runId}/results${tab.key === 'scores' ? '' : `?tab=${tab.key}`}`
        return (
          <Link
            key={tab.key}
            href={href}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
              isActive
                ? 'border-blue-600 text-blue-700'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab.label}
          </Link>
        )
      })}
    </div>
  )
}
