'use client'

import Link from 'next/link'
import { signOut } from 'next-auth/react'

export interface BreadcrumbItem {
  label: string
  href?: string
}

interface AppHeaderProps {
  userEmail?: string | null
  breadcrumb?: BreadcrumbItem[]
  modelName?: string | null
}

export default function AppHeader({ userEmail, breadcrumb, modelName }: AppHeaderProps) {
  return (
    <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-sm border-b border-gray-100">
      <div className="max-w-5xl mx-auto px-4 h-12 flex items-center justify-between gap-4">

        {/* Left: logo + breadcrumb */}
        <div className="flex items-center gap-2 min-w-0">
          <Link href="/" className="flex items-center gap-1.5 shrink-0">
            <div className="w-6 h-6 bg-blue-600 rounded-md flex items-center justify-center">
              <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 7.5L7.5 3m0 0L12 7.5M7.5 3v13.5m13.5 0L16.5 21m0 0L12 16.5m4.5 4.5V7.5" />
              </svg>
            </div>
            <span className="text-sm font-semibold text-gray-800">ScoreStack</span>
          </Link>

          {breadcrumb && breadcrumb.length > 0 && (
            <nav className="flex items-center gap-1 min-w-0" aria-label="Breadcrumb">
              {breadcrumb.map((item, i) => (
                <span key={i} className="flex items-center gap-1 min-w-0">
                  <svg className="w-3 h-3 text-gray-300 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                  </svg>
                  {item.href ? (
                    <Link href={item.href} className="text-xs text-gray-400 hover:text-gray-600 truncate transition-colors">
                      {item.label}
                    </Link>
                  ) : (
                    <span className="text-xs text-gray-600 font-medium truncate">{item.label}</span>
                  )}
                </span>
              ))}
            </nav>
          )}
        </div>

        {/* Right: model pill + user */}
        <div className="flex items-center gap-2 shrink-0">
          {modelName && (
            <span className="hidden sm:inline-flex items-center gap-1 text-[11px] font-medium text-blue-700 bg-blue-50 border border-blue-100 px-2 py-0.5 rounded-full">
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              {modelName}
            </span>
          )}

          {userEmail ? (
            <div className="flex items-center gap-2">
              <span className="hidden sm:block text-xs text-gray-500 max-w-[180px] truncate">{userEmail}</span>
              <button
                onClick={() => signOut({ callbackUrl: '/' })}
                className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
              >
                Sign out
              </button>
            </div>
          ) : (
            <Link href="/auth/signin" className="text-xs text-blue-600 hover:underline font-medium">
              Sign in
            </Link>
          )}
        </div>

      </div>
    </header>
  )
}
