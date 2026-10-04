import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import './globals.css'

export const metadata: Metadata = {
  title: 'VEZ Proof of Reserves | Vyft',
  description:
    'Live on-chain Proof of Reserves for VEZ stablecoin on Slura — reserves, collateralization ratio, supply.',
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  )
}
