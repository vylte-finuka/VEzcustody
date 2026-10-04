import { NextRequest, NextResponse } from 'next/server'
import React from 'react'
import { renderToBuffer } from '@react-pdf/renderer'
import { MONTHLY_REPORTS } from '../../../../lib/monthly-reports'
import {
  ReserveReportDocument,
  type ReserveReportData,
} from '../../../../lib/pdf/ReserveReportDocument'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const RPC = process.env.SLURA_RPC_URL || 'https://slu-charene.vyft-one.com'
const VEZ = (
  process.env.VEZ_PROXY_ADDRESS ||
  '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee'
).toLowerCase()
const ORACLE = (
  process.env.EAC_AGGREGATOR_ADDRESS ||
  '0xcccccccccccccccccccccccccccccccccccccccc'
).toLowerCase()
const CUSTODIAN = (
  process.env.CUSTODIAN_ADDRESS ||
  '0x53ae54b11251d5003e9aa51422405bc35a2ef32d'
).toLowerCase()

async function rpcCall(method: string, params: unknown[] = []): Promise<unknown> {
  const res = await fetch(RPC, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    cache: 'no-store',
  })
  if (!res.ok) throw new Error(`RPC HTTP ${res.status}`)
  const json = (await res.json()) as { result?: unknown; error?: { message?: string } }
  if (json.error) throw new Error(json.error.message || 'RPC error')
  return json.result
}

function hexToBigInt(hex: unknown): bigint {
  if (typeof hex !== 'string' || !hex.startsWith('0x')) return 0n
  if (hex === '0x' || hex === '0x0') return 0n
  return BigInt(hex)
}

function formatUnits18(wei: bigint): string {
  const neg = wei < 0n
  const v = neg ? -wei : wei
  const whole = v / 10n ** 18n
  const frac = (v % 10n ** 18n).toString().padStart(18, '0').replace(/0+$/, '')
  const s = frac ? `${whole}.${frac.slice(0, 6)}` : whole.toString()
  return neg ? `-${s}` : s
}

async function liveSnapshot(): Promise<{
  reserveEUR: string
  supplyVEZ: string
  ratio: string
  status: string
  blockNumber: string
  roundId: string
}> {
  let reserve = 0n
  let supply = 0n
  let roundId = ''
  let blockNumber = ''

  try {
    const bn = await rpcCall('eth_blockNumber')
    blockNumber = String(parseInt(String(bn), 16))
  } catch {
    blockNumber = '—'
  }

  try {
    const data = (await rpcCall('eth_call', [
      { to: ORACLE, data: '0xfeaf968c' },
      'latest',
    ])) as string
    if (data && data.length >= 2 + 64 * 2) {
      const h = data.slice(2)
      roundId = BigInt('0x' + h.slice(0, 64)).toString()
      let answer = BigInt('0x' + h.slice(64, 128))
      if (answer > 2n ** 255n) answer = answer - 2n ** 256n
      reserve = answer < 0n ? -answer : answer
    }
  } catch {
    /* keep 0 */
  }

  try {
    const data = (await rpcCall('eth_call', [
      { to: VEZ, data: '0x18160ddd' },
      'latest',
    ])) as string
    supply = hexToBigInt(data)
  } catch {
    try {
      const bal = await rpcCall('eth_getBalance', [CUSTODIAN, 'latest'])
      supply = hexToBigInt(bal)
    } catch {
      supply = 0n
    }
  }

  let ratio = 0
  let status = 'Under Backed'
  if (supply === 0n && reserve > 0n) {
    ratio = 100
    status = 'Fully Backed'
  } else if (supply > 0n && reserve > 0n) {
    ratio = Number((reserve * 10000n) / supply) / 100
    status = ratio >= 99.5 ? 'Fully Backed' : ratio > 0 ? 'Partial' : 'Under Backed'
  } else if (supply === 0n && reserve === 0n) {
    status = 'Idle'
  }

  return {
    reserveEUR: formatUnits18(reserve),
    supplyVEZ: formatUnits18(supply),
    ratio: ratio.toFixed(2),
    status,
    blockNumber,
    roundId,
  }
}

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> | { id: string } }
) {
  try {
    const params = await Promise.resolve(context.params)
    const id = params.id

    const report = MONTHLY_REPORTS.find((r) => r.id === id || r.month === id)
    if (!report) {
      return NextResponse.json({ error: 'Report not found' }, { status: 404 })
    }

    const live = await liveSnapshot()

    const data: ReserveReportData = {
      periodLabel: report.label,
      month: report.month,
      issuedAt: new Date().toISOString().slice(0, 10),
      reserveEUR: report.reserveEUR ?? live.reserveEUR,
      supplyVEZ: report.supplyVEZ ?? live.supplyVEZ,
      ratio: report.ratio ?? live.ratio,
      status: report.status === 'published' ? live.status : live.status,
      chainId: 45057,
      rpc: RPC,
      vezProxy: VEZ,
      oracle: ORACLE,
      custodian: CUSTODIAN,
      blockNumber: live.blockNumber,
      roundId: live.roundId,
      note: report.note,
    }

    // @react-pdf/renderer — server-side buffer
    const element = React.createElement(ReserveReportDocument, { data })
    const buffer = await renderToBuffer(element as React.ReactElement)

    const filename = `VEZ-reserve-attestation-${report.month}.pdf`

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (e) {
    console.error('PDF report error:', e)
    return NextResponse.json(
      {
        error: 'PDF generation failed',
        detail: e instanceof Error ? e.message : String(e),
      },
      { status: 500 }
    )
  }
}
