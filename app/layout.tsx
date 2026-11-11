import { Analytics } from '@vercel/analytics/next'
import type { Metadata, Viewport } from 'next'
import { sansFont, serifFont } from '@/lib/fonts'
import './globals.css'

export const metadata: Metadata = {
  title: 'Kaminari Time Slip',
  description:
    'A samurai thrown through time by lightning. Slash each bolt the instant it strikes — the better the timing, the farther you leap through the ages.',
  generator: 'v0.app',
  icons: {
    icon: [
      {
        url: '/icon-light-32x32.png',
        media: '(prefers-color-scheme: light)',
      },
      {
        url: '/icon-dark-32x32.png',
        media: '(prefers-color-scheme: dark)',
      },
      {
        url: '/icon.svg',
        type: 'image/svg+xml',
      },
    ],
    apple: '/apple-icon.png',
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
  colorScheme: 'dark',
  themeColor: '#0b0d1f',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className={`${serifFont.variable} ${sansFont.variable} bg-background`}>
      <body className="font-sans antialiased">
        {children}
        {process.env.NODE_ENV === 'production' && <Analytics />}
      </body>
    </html>
  )
}
