import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import './globals.css'

export const metadata: Metadata = {
  title: 'VEZ Stablecoin — Proof of Reserves | Vyft',
  description:
    'VEZ Stablecoin Proof of Reserves Dashboard on Spura / Slura Chain — design Vyft',
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  )
}
