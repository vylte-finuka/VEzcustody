/** Monthly reserve attestation reports — institution-grade disclosure log */
export type MonthlyReport = {
  id: string
  month: string // YYYY-MM
  label: string // e.g. "October 2026"
  status: 'published' | 'pending'
  /** Public URL to PDF / statement when published */
  url?: string
  /** Snapshot figures at attestation date (optional) */
  reserveEUR?: string
  supplyVEZ?: string
  ratio?: string
  note?: string
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
    status: 'pending',
    note: 'Attestation cycle in progress',
  },
  {
    id: '2026-09',
    month: '2026-09',
    label: 'September 2026',
    status: 'pending',
  },
]
