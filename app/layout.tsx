import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import Providers from './providers'
import AppFooter from './components/AppFooter'
import './globals.css'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'ScoreStack',
  description: 'Upload your contact list, define what good looks like, and get it ranked using real LinkedIn data.',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className={`${inter.className} antialiased flex flex-col min-h-screen`}>
        <Providers>
          <div className="flex-1">{children}</div>
          <AppFooter />
        </Providers>
      </body>
    </html>
  )
}
