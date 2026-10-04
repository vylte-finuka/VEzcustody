/** Monthly reserve attestation reports — institution-grade disclosure log */
export type MonthlyReport = {
  id: string
  month: string // YYYY-MM
  label: string
  status: 'published' | 'pending'
  /** Public URL to PDF when published — defaults to /api/reports/{id} */
  url?: string
  reserveEUR?: string
  supplyVEZ?: string
  ratio?: string
  note?: string
}

/**
 * Newest first. PDF via @react-pdf/renderer at GET /api/reports/{id}
 */
export const MONTHLY_REPORTS: MonthlyReport[] = [
  {
    id: '2026-10',
    month: '2026-10',
    label: 'October 2026',
    status: 'published',
    url: '/api/reports/2026-10',
    note: 'On-chain snapshot via EAC latestRoundData',
  },
  {
    id: '2026-09',
    month: '2026-09',
    label: 'September 2026',
    status: 'pending',
  },
]

export function reportPdfPath(id: string): string {
  return `/api/reports/${id}`
}
