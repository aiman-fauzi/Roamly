import type { Metadata } from 'next'

import { ToastProvider } from '@/components/ui/Toast'
import { getSiteUrl } from '@/lib/siteUrl'

import './globals.css'

export const metadata: Metadata = {
  title: {
    default: 'Roamly - Plan Less. Explore More.',
    template: '%s | Roamly',
  },
  description:
    'Roamly generates personalised travel itineraries based on your preferences. Plan less, explore more.',
  metadataBase: new URL(getSiteUrl()),
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <body>
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  )
}
