import Link from 'next/link'

export interface BreadcrumbItem {
  label: string
  href?: string
}

export default function Breadcrumb({ items }: { items: BreadcrumbItem[] }) {
  if (!items.length) return null
  return (
    <nav className="flex items-center gap-1 mb-4" aria-label="Breadcrumb">
      {items.map((item, i) => (
        <span key={i} className="flex items-center gap-1 min-w-0">
          {i > 0 && (
            <svg className="w-3 h-3 text-gray-300 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
            </svg>
          )}
          {item.href ? (
            <Link href={item.href} className="text-xs text-gray-400 hover:text-gray-600 truncate transition-colors">
              {item.label}
            </Link>
          ) : (
            <span className="text-xs text-gray-500 font-medium truncate">{item.label}</span>
          )}
        </span>
      ))}
    </nav>
  )
}
