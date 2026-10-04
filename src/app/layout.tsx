import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import './globals.css'

export const metadata: Metadata = {
  title: 'VEZ Proof of Reserves',
  description:
    'Institution-grade live Proof of Reserves and monthly attestation reports for VEZ.',
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        {/* Static CSS fallback — survives broken Next CSS pipeline on Netlify */}
        <link rel="stylesheet" href="/vez-por.css" />
        <link
          rel="preload"
          href="/font/brsonomasemibold.ttf"
          as="font"
          type="font/ttf"
          crossOrigin="anonymous"
        />
      </head>
      <body>{children}</body>
    </html>
  )
}
