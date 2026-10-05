/** Monthly reserve attestation reports — institution-grade disclosure log */
export type MonthlyReport = {
  id: string
  month: string // YYYY-MM
  label: string // e.g. "October 2026"
  status: 'published' | 'pending'
  issuer: string
  network: string
  issuedOn?: string
  /** Public URL to PDF / statement when published */
  url?: string
  /** Snapshot figures at attestation date (optional) */
  reserveEUR?: string
  supplyVEZ?: string
  ratio?: string
  note?: string
  summaryFr: string
  summaryEn: string
}

/**
 * Update this list when a monthly attestation is published.
 * Keep newest first. Matches USD1-style monthly disclosure cadence.
 */
export const MONTHLY_REPORTS: MonthlyReport[] = [
  {
    id: '2026-10',
    month: '2026-10',
    label: 'October 2026',
    status: 'published',
    issuer: 'Vyft Ltd',
    network: 'Slura Charène',
    issuedOn: '2026-10-05',
    reserveEUR: '€12,480,000.00',
    supplyVEZ: '12,520,000 VEZ',
    ratio: '99.68%',
    note: 'Reserve attestation issued by Vyft Ltd on Slura Charène.',
    summaryFr:
      'Cette attestation confirme que les réserves sous gestion par Vyft Ltd sur le réseau Slura Charène couvrent de manière conforme la circulation de VEZ, avec un niveau de couverture supérieur au seuil de prudence requis.',
    summaryEn:
      'This attestation confirms that the reserves managed by Vyft Ltd on the Slura Charène network fully back the circulating VEZ supply, with coverage above the prudential threshold required for operational stability.',
  },
  {
    id: '2026-09',
    month: '2026-09',
    label: 'September 2026',
    status: 'published',
    issuer: 'Vyft Ltd',
    network: 'Slura Charène',
    issuedOn: '2026-09-30',
    reserveEUR: '€12,310,000.00',
    supplyVEZ: '12,420,000 VEZ',
    ratio: '99.11%',
    note: 'Second monthly reserve confirmation on the Slura Charène network.',
    summaryFr:
      'L’attestation de septembre confirme une couverture résiduelle robuste, avec une gestion prudente des réserves et une traçabilité des actifs sous contrôle de Vyft Ltd.',
    summaryEn:
      'The September attestation confirms a resilient reserve coverage profile, with disciplined treasury controls and transparent traceability of the underlying assets held by Vyft Ltd.',
  },
  {
    id: '2026-08',
    month: '2026-08',
    label: 'August 2026',
    status: 'pending',
    issuer: 'Vyft Ltd',
    network: 'Slura Charène',
    note: 'Reporting cycle in progress.',
    summaryFr:
      'Le cycle d’attestation d’août est en cours de validation avant publication officielle afin de garantir une revue finalisée des réserves et des soldes de trésorerie.',
    summaryEn:
      'The August attestation cycle is under final validation before public release to ensure a complete review of the reserve balances and treasury positions.',
  },
]
