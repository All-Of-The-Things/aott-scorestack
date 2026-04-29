'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import { signOut } from 'next-auth/react'

export interface BreadcrumbItem {
  label: string
  href?: string
}

interface AppHeaderProps {
  userEmail?: string | null
  breadcrumb?: BreadcrumbItem[]
  modelName?: string | null
  plan?: string | null
}

const PLAN_LABEL: Record<string, string> = {
  free: 'Free', starter: 'Starter', pro: 'Pro', enterprise: 'Enterprise',
}

const PLAN_BADGE: Record<string, string> = {
  free:       'text-gray-500 bg-gray-100',
  starter:    'text-blue-700 bg-blue-50 border border-blue-100',
  pro:        'text-purple-700 bg-purple-50 border border-purple-100',
  enterprise: 'text-amber-700 bg-amber-50 border border-amber-100',
}

const NAV_LINKS = [
  { href: '/runs', label: 'Enrichments' },
  { href: '/delivery', label: 'Delivery', proOnly: true },
]

export default function AppHeader({ userEmail, breadcrumb, modelName, plan }: AppHeaderProps) {
  const [open, setOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const pathname = usePathname()

  useEffect(() => {
    if (!open) return
    function handleOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleOutside)
    return () => document.removeEventListener('mousedown', handleOutside)
  }, [open])

  const planLabel = plan ? (PLAN_LABEL[plan] ?? plan) : null
  const badgeClass = plan ? (PLAN_BADGE[plan] ?? PLAN_BADGE.free) : ''

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

          {userEmail && !breadcrumb && (
            <div className="hidden sm:flex items-center gap-0.5 ml-1 shrink-0">
              {NAV_LINKS.filter((link) => !link.proOnly || plan === 'pro' || plan === 'enterprise').map((link) => {
                const isActive = pathname === link.href || pathname.startsWith(link.href + '/')
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
                      isActive
                        ? 'text-gray-900 bg-gray-100'
                        : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    {link.label}
                  </Link>
                )
              })}
            </div>
          )}

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

        {/* Right: model pill + user menu */}
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
            <div
              ref={menuRef}
              className="relative"
            >
              {/* Trigger */}
              <button
                type="button"
                onClick={() => setOpen(v => !v)}
                className="flex items-center gap-1.5 rounded-lg px-1.5 py-1 -mr-1.5 hover:bg-gray-50 transition-colors"
              >
                <span className="hidden sm:block text-xs text-gray-500 max-w-[140px] truncate">
                  {userEmail}
                </span>
                {planLabel && (
                  <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${badgeClass}`}>
                    {planLabel}
                  </span>
                )}
                <svg className="w-3 h-3 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                </svg>
              </button>

              {/* Dropdown */}
              {open && (
                <div className="absolute right-0 top-full mt-1 w-52 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden z-50">
                  {/* User info */}
                  <div className="px-3 py-2.5 border-b border-gray-100">
                    <p className="text-xs font-medium text-gray-700 truncate">{userEmail}</p>
                    {planLabel && (
                      <span className={`inline-flex mt-1.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${badgeClass}`}>
                        {planLabel}
                      </span>
                    )}
                  </div>

                  {/* Plan settings */}
                  <Link
                    href="/settings/billing"
                    onClick={() => setOpen(false)}
                    className="flex items-center gap-2 px-3 py-2 text-xs text-gray-700 hover:bg-gray-50 transition-colors"
                  >
                    <svg className="w-3.5 h-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 010 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 010-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    Plan settings
                  </Link>

                  {/* Sign out */}
                  <div className="border-t border-gray-100">
                    <button
                      type="button"
                      onClick={() => { setOpen(false); signOut({ callbackUrl: '/' }) }}
                      className="flex w-full items-center gap-2 px-3 py-2 text-xs text-gray-700 hover:bg-gray-50 transition-colors"
                    >
                      <svg className="w-3.5 h-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75" />
                      </svg>
                      Sign out
                    </button>
                  </div>
                </div>
              )}
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
