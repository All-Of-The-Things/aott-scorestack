import Link from 'next/link'
import { auth } from '@/app/lib/auth'
import AppHeader from './components/AppHeader'

const BADGE_CLASS: Record<string, string> = {
  'Starter+': 'text-blue-700 bg-blue-50 border-blue-100',
  'Pro':      'text-purple-700 bg-purple-50 border-purple-100',
  'Enterprise': 'text-amber-700 bg-amber-50 border-amber-100',
}

const HOW_IT_WORKS = [
  {
    step: '1',
    label: 'Upload your CSV',
    sub: 'Drop in any spreadsheet with LinkedIn profile URLs.',
  },
  {
    step: '2',
    label: 'Define your criteria',
    sub: 'Specify titles, seniority levels, industries, and company size.',
  },
  {
    step: '3',
    label: 'Get ranked results',
    sub: 'Every contact is enriched, scored, and sorted by fit.',
  },
]

const FEATURES = [
  {
    title: 'LinkedIn enrichment',
    desc: 'Current title, company, seniority, industry, and location — pulled automatically.',
    icon: (
      <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
    ),
  },
  {
    title: 'AI-powered scoring',
    desc: 'Define what a great fit looks like; Claude grades every contact against your criteria.',
    icon: (
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
    ),
  },
  {
    title: 'CSV export',
    desc: 'Download your enriched, scored list ready to import into your CRM or sequencer.',
    icon: (
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
    ),
    badge: 'Starter+',
  },
  {
    title: 'AI message generation',
    desc: 'Generate personalised LinkedIn outreach for each contact — in one click.',
    icon: (
      <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 01.865-.501 48.172 48.172 0 003.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" />
    ),
    badge: 'Starter+',
  },
  {
    title: 'BYOK message delivery',
    desc: 'Send LinkedIn messages directly from your own account using your own credentials — full control, no shared infrastructure.',
    icon: (
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z" />
    ),
    badge: 'Pro',
  },
  {
    title: 'Custom implementations',
    desc: 'Dedicated onboarding, custom integrations, and SLA-backed support tailored to your team\'s workflow.',
    icon: (
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21M3 3h12m-.75 4.5H21m-3.75 3.75h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008z" />
    ),
    badge: 'Enterprise',
  },
]

export default async function MarketingPage() {
  const session = await auth()
  const userEmail = session?.user?.email ?? null
  const plan = session?.user?.plan ?? null
  const isAuthenticated = !!session

  return (
    <>
      <AppHeader userEmail={userEmail} plan={plan} />

      <main className="bg-white">

        {/* Hero */}
        <section className="max-w-5xl mx-auto px-4 pt-20 pb-16 sm:pt-28 sm:pb-20 text-center">
          <div className="inline-flex items-center gap-2 mb-6">
            <div className="w-9 h-9 bg-blue-600 rounded-xl flex items-center justify-center">
              <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 7.5L7.5 3m0 0L12 7.5M7.5 3v13.5m13.5 0L16.5 21m0 0L12 16.5m4.5 4.5V7.5" />
              </svg>
            </div>
            <span className="text-2xl font-bold tracking-tight text-gray-900">ScoreStack</span>
          </div>

          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight text-gray-900 leading-tight max-w-3xl mx-auto">
            Score your contact list{' '}
            <span className="text-blue-600">with LinkedIn data</span>
          </h1>
          <p className="mt-5 text-lg sm:text-xl text-gray-500 max-w-2xl mx-auto leading-relaxed">
            Upload a CSV of LinkedIn profiles, define what a great fit looks like,
            and get a ranked, enriched list ready to work — in minutes.
          </p>

          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
            {isAuthenticated ? (
              <Link
                href="/runs"
                className="inline-flex items-center gap-2 px-6 py-3 text-base font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-colors shadow-sm"
              >
                My enrichments
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                </svg>
              </Link>
            ) : (
              <Link
                href="/enrich"
                className="inline-flex items-center gap-2 px-6 py-3 text-base font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-colors shadow-sm"
              >
                Try it free
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                </svg>
              </Link>
            )}
          </div>

          {!isAuthenticated && (
            <p className="mt-4 text-xs text-gray-400">No credit card required · Free plan available</p>
          )}
        </section>

        {/* How it works */}
        <section className="bg-gray-50 border-t border-b border-gray-100">
          <div className="max-w-5xl mx-auto px-4 py-16">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest text-center mb-10">
              How it works
            </p>
            <div className="grid sm:grid-cols-3 gap-8">
              {HOW_IT_WORKS.map(({ step, label, sub }) => (
                <div key={step} className="flex flex-col items-center text-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-blue-600 text-white text-sm font-bold flex items-center justify-center shrink-0">
                    {step}
                  </div>
                  <p className="text-sm font-semibold text-gray-800">{label}</p>
                  <p className="text-sm text-gray-500 leading-relaxed">{sub}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Features */}
        <section className="max-w-5xl mx-auto px-4 py-16 sm:py-20">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest text-center mb-10">
            Everything you need
          </p>
          <div className="grid sm:grid-cols-2 gap-6">
            {FEATURES.map(({ title, desc, icon, badge }) => (
              <div key={title} className="relative flex gap-4 p-5 bg-gray-50 rounded-2xl border border-gray-100">
                <div className="w-9 h-9 bg-white border border-gray-200 rounded-xl flex items-center justify-center shrink-0 shadow-sm">
                  <svg className="w-4 h-4 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                    {icon}
                  </svg>
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <p className="text-sm font-semibold text-gray-800">{title}</p>
                    {badge && (
                      <span className={`text-[10px] font-semibold border px-1.5 py-0.5 rounded-full ${BADGE_CLASS[badge] ?? BADGE_CLASS['Starter+']}`}>
                        {badge}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-500 leading-relaxed">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Bottom CTA */}
        <section className="bg-blue-600">
          <div className="max-w-5xl mx-auto px-4 py-14 text-center">
            <h2 className="text-2xl sm:text-3xl font-bold text-white mb-3">
              Ready to find your best leads?
            </h2>
            <p className="text-blue-200 text-base mb-7 max-w-lg mx-auto">
              {isAuthenticated
                ? 'Pick up where you left off or start a new enrichment.'
                : 'Start with a free account — no credit card required.'}
            </p>
            <Link
              href={isAuthenticated ? '/runs' : '/enrich'}
              className="inline-flex items-center gap-2 px-7 py-3 text-base font-semibold text-blue-600 bg-white hover:bg-blue-50 rounded-xl transition-colors shadow-sm"
            >
              {isAuthenticated ? 'Go to my enrichments' : 'Start for free'}
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
              </svg>
            </Link>
          </div>
        </section>

      </main>
    </>
  )
}
