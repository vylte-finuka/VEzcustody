'use client'

import React, { useCallback, useEffect, useState } from 'react'
import { MONTHLY_REPORTS } from '../lib/monthly-reports'

const RPC =
  process.env.NEXT_PUBLIC_SLURA_RPC_URL || 'https://slu-charene.vyft-one.com'
const VEZ = (
  process.env.NEXT_PUBLIC_VEZ_PROXY_ADDRESS ||
  '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee'
).toLowerCase()
const AGG = (
  process.env.NEXT_PUBLIC_AGGREGATOR_ADDRESS ||
  '0xcccccccccccccccccccccccccccccccccccccccc'
).toLowerCase()
const CUSTODIAN = '0x53ae54b11251d5003e9aa51422405bc35a2ef32d'.toLowerCase()

type PorView = {
  totalSupply: string
  reserve: string
  ratio: string
  isBacked: boolean
  status: string
  custodian: string
  custodianBal: string
  balances: Record<string, string>
  oracleDeployed: boolean
  aggregator: string
  vezProxy: string
  chainId: number
  supplySource: string
  warnings: string[]
  sources: string[]
  fetchedAt: string
}

async function rpcCall(method: string, params: unknown[]): Promise<unknown> {
  const res = await fetch(RPC, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', method, params, id: 1 }),
  })
  if (!res.ok) throw new Error(`RPC HTTP ${res.status}`)
  const json = await res.json()
  if (json.error) throw new Error(json.error.message || 'RPC error')
  return json.result
}

function hexToBigInt(hex: unknown): bigint {
  if (typeof hex !== 'string' || !hex || hex === '0x') return 0n
  return BigInt(hex)
}

function formatVez(wei: bigint): string {
  const whole = wei / 10n ** 18n
  const frac = wei % 10n ** 18n
  if (frac === 0n) return whole.toLocaleString('fr-FR')
  const f = frac.toString().padStart(18, '0').replace(/0+$/, '')
  return `${whole.toLocaleString('fr-FR')}.${f}`
}

/** Résultat eth_call valide (pas un dump de bytecode) */
function isValidCall(hex: unknown, maxWords = 8): boolean {
  if (typeof hex !== 'string' || !hex.startsWith('0x') || hex.length < 66) return false
  const body = hex.slice(2)
  if (body.length > 64 * maxWords) return false
  if (body.startsWith('60806040') || body.startsWith('575f5ffd')) return false
  return true
}

async function fetchPorClient(): Promise<PorView> {
  const warnings: string[] = []
  const sources: string[] = []

  const chainIdHex = (await rpcCall('eth_chainId', [])) as string
  const chainId = Number.parseInt(chainIdHex, 16)

  // --- Supply via eth_getBalance (fiable sur Slura) ---
  const holders = new Set<string>([CUSTODIAN, VEZ])
  try {
    const accounts = (await rpcCall('eth_accounts', [])) as string[]
    for (const a of accounts || []) holders.add(a.toLowerCase())
  } catch {
    /* optional */
  }

  const balances: Record<string, string> = {}
  let sum = 0n
  for (const addr of holders) {
    try {
      const bal = hexToBigInt(await rpcCall('eth_getBalance', [addr, 'latest']))
      balances[addr] = formatVez(bal)
      sum += bal
    } catch {
      balances[addr] = '0'
    }
  }

  let totalSupply = sum
  let supplySource = sum > 0n ? 'eth_getBalance(sum)' : 'none'
  if (sum > 0n) sources.push('native balances')

  // totalSupply() seulement si eth_call valide
  try {
    const ts = await rpcCall('eth_call', [{ to: VEZ, data: '0x18160ddd' }, 'latest'])
    if (isValidCall(ts, 1)) {
      const v = hexToBigInt(ts)
      if (v > 0n) {
        totalSupply = v
        supplySource = 'totalSupply()'
        sources.push('totalSupply')
      }
    } else {
      warnings.push('eth_call totalSupply() invalide (bytecode / vide) — solde natif utilisé')
    }
  } catch (e) {
    warnings.push(`totalSupply: ${e instanceof Error ? e.message : String(e)}`)
  }

  // --- Oracle ---
  let reserve = 0n
  let oracleDeployed = false
  let aggregator = AGG
  try {
    const code = (await rpcCall('eth_getCode', [AGG, 'latest'])) as string
    oracleDeployed = !!(code && code !== '0x' && code.length > 4)
  } catch {
    warnings.push('eth_getCode oracle échoué')
  }

  const tryRound = async (addr: string) => {
    for (const data of ['0xfeaf968c', '0x4cf0d314'] as const) {
      try {
        const raw = await rpcCall('eth_call', [{ to: addr, data }, 'latest'])
        if (!isValidCall(raw, 5)) continue
        const body = (raw as string).slice(2)
        if (body.length < 320) continue
        const words = body.match(/.{64}/g) || []
        return BigInt('0x' + words[1])
      } catch {
        /* next */
      }
    }
    return null
  }

  if (oracleDeployed) {
    const ans = await tryRound(AGG)
    if (ans !== null) {
      reserve = ans
      sources.push('oracle')
    } else {
      warnings.push('Oracle déployé mais round data illisible')
    }
  } else {
    warnings.push(`Oracle non déployé à ${AGG}`)
    // tentative sur VEZ au cas où
    const ans = await tryRound(VEZ)
    if (ans !== null) {
      reserve = ans
      aggregator = VEZ
      oracleDeployed = true
      sources.push('oracle@vez')
      warnings.push('Oracle lu depuis VEZ proxy')
    }
  }

  let ratio = 0
  let status = 'Under Backed / No Oracle'
  if (totalSupply === 0n && reserve > 0n) {
    ratio = 100
    status = 'Fully Backed'
  } else if (totalSupply === 0n && reserve === 0n) {
    ratio = 0
    status = 'No Reserve / Idle'
  } else if (totalSupply > 0n && reserve > 0n) {
    ratio = Number((reserve * 10000n) / totalSupply) / 100
    status = ratio >= 99.5 ? 'Fully Backed' : ratio > 0 ? 'Partial' : 'Under Backed'
  } else if (totalSupply > 0n) {
    ratio = 0
    status = 'Under Backed / No Oracle'
  }
  const isBacked = ratio >= 99.5

  return {
    totalSupply: formatVez(totalSupply),
    reserve: formatVez(reserve),
    ratio: ratio.toFixed(2),
    isBacked,
    status,
    custodian: CUSTODIAN,
    custodianBal: balances[CUSTODIAN] || '0',
    balances,
    oracleDeployed,
    aggregator,
    vezProxy: VEZ,
    chainId,
    supplySource,
    warnings,
    sources,
    fetchedAt: new Date().toISOString(),
  }
}

function copyText(text: string) {
  if (typeof navigator !== 'undefined' && navigator.clipboard) {
    navigator.clipboard.writeText(text).catch(() => {})
  }
}

function parseNumericValue(raw: string | null | undefined): number {
  if (!raw) return 0
  const normalized = String(raw)
    .replace(/[^0-9,.-]/g, '')
    .replace(/,/g, '')
    .replace(/\.(?=.*\.)/g, '')
  const value = Number.parseFloat(normalized)
  return Number.isFinite(value) ? value : 0
}

export default function Home() {
  const [data, setData] = useState<PorView | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [mintTo, setMintTo] = useState(CUSTODIAN)
  const [mintAmount, setMintAmount] = useState('1')
  const [minting, setMinting] = useState(false)
  const [mintMsg, setMintMsg] = useState('')
  const [blockNumber, setBlockNumber] = useState('')
  const [fxRate, setFxRate] = useState(1.09)

  useEffect(() => {
    ;(async () => {
      try {
        const res = await fetch('https://api.frankfurter.app/latest?from=EUR&to=USD', {
          cache: 'no-store',
        })
        const json = await res.json()
        const rate = Number(json?.rates?.USD)
        if (Number.isFinite(rate) && rate > 0) setFxRate(rate)
      } catch {
        /* keep fallback */
      }
    })()
  }, [])

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      try {
        const res = await fetch('/api/por', { cache: 'no-store' })
        if (res.ok) {
          const json = await res.json()
          if (json?.ok) {
            const supplyStr = String(json.totalSupply ?? '0')
            const reserveStr = String(json.reserveAnswer ?? '0')
            const supplyN =
              parseFloat(supplyStr.replace(/\s/g, '').replace(',', '.')) || 0
            const reserveN =
              parseFloat(reserveStr.replace(/\s/g, '').replace(',', '.')) || 0
            let ratio = String(json.reserveRatio ?? '0')
            let isBacked = !!json.isBacked
            let status = String(json.status || '')
            if (supplyN === 0 && reserveN > 0) {
              ratio = '100.00'
              isBacked = true
              status = 'Fully Backed'
            } else if (supplyN > 0 && reserveN > 0) {
              const r = (reserveN / supplyN) * 100
              ratio = r.toFixed(2)
              isBacked = r >= 99.5
              status = isBacked ? 'Fully Backed' : r > 0 ? 'Partial' : 'Under Backed'
            }
            const custodian = (
              json.custodian &&
              json.custodian !== '0x0000000000000000000000000000000000000000'
                ? json.custodian
                : CUSTODIAN
            ).toLowerCase()
            setData({
              totalSupply: supplyStr,
              reserve: reserveStr,
              ratio,
              isBacked,
              status,
              custodian,
              custodianBal:
                json.balances?.[custodian] || json.balances?.[CUSTODIAN] || '0',
              balances: json.balances || {},
              oracleDeployed: json.oracleDeployed,
              aggregator: json.aggregator,
              vezProxy: json.vezProxy,
              chainId: json.chainId,
              supplySource: json.supplySource,
              warnings: json.warnings || [],
              sources: json.sources || [],
              fetchedAt: json.fetchedAt,
            })
            setError('')
            setLoading(false)
            return
          }
        }
      } catch {
        /* client fallback */
      }
      const view = await fetchPorClient()
      setData(view)
      setError('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Load error')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
    const id = setInterval(fetchData, 60_000)
    return () => clearInterval(id)
  }, [fetchData])

  useEffect(() => {
    ;(async () => {
      try {
        const res = await fetch(RPC, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'eth_blockNumber',
            params: [],
          }),
        })
        const j = await res.json()
        if (j.result) setBlockNumber(String(parseInt(j.result, 16)))
      } catch {
        /* ignore */
      }
    })()
  }, [data?.fetchedAt])

  const reserve = data?.reserve ?? (loading ? '…' : '—')
  const supply = data?.totalSupply ?? (loading ? '…' : '—')
  const ratio = data?.ratio ?? (loading ? '…' : '—')
  const reserveValue = parseNumericValue(data?.reserve)
  const reserveUsdValue = reserveValue * fxRate
  const reserveUsdDisplay = reserveUsdValue.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  })
  const isBacked = data?.isBacked ?? false
  const oracle = data?.aggregator ?? AGG
  const vez = data?.vezProxy ?? VEZ
  const custodian = data?.custodian ?? CUSTODIAN

  async function handleMint(e: React.FormEvent) {
    e.preventDefault()
    setMinting(true)
    setMintMsg('')
    try {
      const res = await fetch('/api/mint', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipient: mintTo, amount: mintAmount }),
      })
      const json = await res.json()
      if (!res.ok) {
        setMintMsg(
          (json.error || 'Error') + (json.detail ? ` — ${json.detail}` : '')
        )
      } else {
        setMintMsg(`OK ${json.txHash || ''}`)
        await fetchData()
      }
    } catch (err) {
      setMintMsg(err instanceof Error ? err.message : 'Error')
    } finally {
      setMinting(false)
    }
  }

  return (
    <div className="shell">
      <header className="top">
        <div className="top-inner">
          <div className="brand">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/vyft.png" alt="" />
            <div>
              <strong>VEZ</strong>
              <span>Proof of Reserves</span>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span className="live">
              <i /> Live
            </span>
            <button type="button" className="btn btn-ghost" onClick={fetchData}>
              Refresh
            </button>
          </div>
        </div>
      </header>

      <main className="main">
        {/* Primary figure — reserves */}
        <section className="hero">
          <div className="k">Total reserves</div>
          <div className="n">
            {reserve}
            <span className="u">EUR</span>
          </div>
          <div className="t">
            {data?.fetchedAt
              ? new Date(data.fetchedAt).toLocaleString('en-GB', {
                  dateStyle: 'medium',
                  timeStyle: 'short',
                })
              : ''}
            {blockNumber ? ` · block ${blockNumber}` : ''}
          </div>

          <div className="price-strip" aria-label="Treasury reserve reference">
            <div className="price-chip">
              <span>Reserve value</span>
              <strong>{reserve === '—' ? '—' : `€${reserveValue.toLocaleString('en-US', { maximumFractionDigits: 2 })} EUR`}</strong>
            </div>
            <div className="price-chip accent">
              <span>USD equivalent</span>
              <strong>{reserve === '—' ? '—' : reserveUsdDisplay}</strong>
            </div>
            <div className="price-chip muted">
              <span>FX</span>
              <strong>1 EUR = {fxRate.toFixed(4)} USD</strong>
            </div>
          </div>
        </section>

        {/* Ratio + supply — no long captions */}
        <div className="row2">
          <div className="panel">
            <div className="k">Collateralization</div>
            <div className={`n ${isBacked ? 'ok' : 'bad'}`}>{ratio}%</div>
          </div>
          <div className="panel">
            <div className="k">Total supply</div>
            <div className="n">
              {supply}
              <span style={{ fontSize: '0.45em', color: 'var(--muted)', marginLeft: 4 }}>
                VEZ
              </span>
            </div>
          </div>
        </div>

        {/* Contracts — compact */}
        <section className="panel" style={{ marginBottom: '1rem' }}>
          <div className="panel-h">
            <h2>Contracts</h2>
            <span className="sub">Slura {data?.chainId ?? 45057}</span>
          </div>
          <div className="kv">
            <div>
              <div className="k">Oracle</div>
              <div className="v mono">
                {oracle}
                <button type="button" className="copy" onClick={() => copyText(oracle)}>
                  copy
                </button>
              </div>
            </div>
            <div>
              <div className="k">VEZ</div>
              <div className="v mono">
                {vez}
                <button type="button" className="copy" onClick={() => copyText(vez)}>
                  copy
                </button>
              </div>
            </div>
            <div>
              <div className="k">Custodian</div>
              <div className="v mono">
                {custodian}
                <button type="button" className="copy" onClick={() => copyText(custodian)}>
                  copy
                </button>
              </div>
            </div>
            <div>
              <div className="k">Oracle fn</div>
              <div className="v mono">latestRoundData()</div>
            </div>
            <div>
              <div className="k">Treasury value</div>
              <div className="v mono">
                {reserve === '—' ? '—' : `€${reserveValue.toLocaleString('en-US', { maximumFractionDigits: 2 })} EUR / ${reserveUsdDisplay}`}
              </div>
            </div>
          </div>
        </section>

        {/* Holdings */}
        {data?.balances && Object.keys(data.balances).length > 0 && (
          <section className="panel" style={{ marginBottom: '1rem' }}>
            <div className="panel-h">
              <h2>Holdings</h2>
            </div>
            <table className="data">
              <thead>
                <tr>
                  <th>Address</th>
                  <th>VEZ</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(data.balances).map(([addr, bal]) => (
                  <tr key={addr}>
                    <td className="mono">
                      {addr}
                      <button
                        type="button"
                        className="copy"
                        onClick={() => copyText(addr)}
                      >
                        copy
                      </button>
                    </td>
                    <td>{bal}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        {/* Reserve attestations — issuance and disclosure log */}
        <section className="panel" style={{ marginBottom: '1rem' }}>
          <div className="panel-h">
            <h2>Reserve attestations</h2>
            <span className="sub">Vyft Ltd • Slura Charène</span>
          </div>

          <div className="report-list">
            {MONTHLY_REPORTS.map((r) => (
              <article key={r.id} className="report-card">
                <div className="report-header">
                  <div>
                    <div className="eyebrow">Reserve attestation</div>
                    <h3>{r.label}</h3>
                  </div>
                  <span className={`badge${r.status === 'pending' ? ' pending' : ''}`}>
                    {r.status === 'published' ? 'Published' : 'Pending'}
                  </span>
                </div>

                <div className="report-meta">
                  <span>
                    <strong>Issuer:</strong> {r.issuer || 'Vyft Ltd'}
                  </span>
                  <span>
                    <strong>Network:</strong> {r.network || 'Slura Charène'}
                  </span>
                  <span>
                    <strong>Issued:</strong> {r.issuedOn || 'To be published'}
                  </span>
                </div>

                <div className="report-metrics">
                  <div className="metric-box">
                    <span className="label">Reserve</span>
                    <span className="value">{r.reserveEUR || '—'}</span>
                  </div>
                  <div className="metric-box">
                    <span className="label">Supply</span>
                    <span className="value">{r.supplyVEZ || '—'}</span>
                  </div>
                  <div className="metric-box">
                    <span className="label">Coverage</span>
                    <span className="value">{r.ratio || '—'}</span>
                  </div>
                </div>

                <div className="report-intro">
                  <p>
                    <strong>FR:</strong> {r.summaryFr}
                  </p>
                  <p>
                    <strong>EN:</strong> {r.summaryEn}
                  </p>
                </div>

                <div className="report-cta">
                  {r.status === 'published' && r.url ? (
                    <a className="report-link" href={r.url} target="_blank" rel="noreferrer">
                      View report
                    </a>
                  ) : (
                    <span className="report-status">
                      {r.note || 'Awaiting publication'}
                    </span>
                  )}
                </div>
              </article>
            ))}
          </div>
        </section>

        {error && (
          <p className="msg err" style={{ textAlign: 'center' }}>
            {error}
          </p>
        )}

        <footer className="foot">
          {data?.status ?? ''}
          {data?.sources?.length ? ` · ${(data.sources || []).join(', ')}` : ''}
        </footer>
      </main>
    </div>
  )
}
