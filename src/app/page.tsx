'use client'

import React, { useCallback, useEffect, useState } from 'react'

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

export default function Home() {
  const [data, setData] = useState<PorView | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [mintTo, setMintTo] = useState(CUSTODIAN)
  const [mintAmount, setMintAmount] = useState('1')
  const [minting, setMinting] = useState(false)
  const [mintMsg, setMintMsg] = useState('')
  const [blockNumber, setBlockNumber] = useState<string>('')

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
            const supplyN = parseFloat(supplyStr.replace(/\s/g, '').replace(',', '.')) || 0
            const reserveN = parseFloat(reserveStr.replace(/\s/g, '').replace(',', '.')) || 0
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
        /* fallback */
      }
      const view = await fetchPorClient()
      setData(view)
      setError('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur chargement PoR')
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

  const supply = data?.totalSupply ?? '—'
  const reserve = data?.reserve ?? '—'
  const ratio = data?.ratio ?? '—'
  const isBacked = data?.isBacked ?? false
  const ratioClass = isBacked ? 'ok' : parseFloat(ratio) > 0 ? 'warn' : 'bad'

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
          (json.error || 'Erreur') +
            (json.availableToMint != null
              ? ` · dispo ${json.availableToMint} VEZ`
              : '') +
            (json.detail ? ` — ${json.detail}` : '')
        )
      } else {
        setMintMsg(`OK · ${json.message || 'minted'} · ${json.txHash}`)
        await fetchData()
      }
    } catch (err) {
      setMintMsg(err instanceof Error ? err.message : 'Erreur mint')
    } finally {
      setMinting(false)
    }
  }

  const oracle = data?.aggregator ?? AGG
  const vez = data?.vezProxy ?? VEZ
  const custodian = data?.custodian ?? CUSTODIAN

  return (
    <div className="por-shell">
      <header className="por-header">
        <div className="por-header-inner">
          <div className="por-brand">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/vyft.png" alt="Vyft" />
            <div>
              <h1>VEZ Proof of Reserves</h1>
              <p>Live on-chain · Slura Charène</p>
            </div>
          </div>
          <div className="por-header-actions">
            <span className="live-badge">
              <span className="pulse" />
              Live
            </span>
            <button type="button" className="btn" onClick={fetchData} disabled={loading}>
              {loading ? 'Refreshing…' : 'Refresh'}
            </button>
          </div>
        </div>
      </header>

      <main className="por-main">
        {/* HERO — total reserves (USD1 layout) */}
        <section className="por-hero">
          <p className="eyebrow">Total reserves backing VEZ</p>
          {loading && !data ? (
            <div className="skel" style={{ width: '12rem', height: '3.5rem', margin: '0 auto' }} />
          ) : (
            <div className="hero-value">
              {reserve}
              <span className="hero-unit">EUR</span>
            </div>
          )}
          <p className="meta">
            {data?.fetchedAt
              ? `Last refresh: ${new Date(data.fetchedAt).toLocaleString('fr-FR')}`
              : 'Loading…'}
            {' · '}
            Status: <strong style={{ color: isBacked ? 'var(--success)' : 'var(--warning)' }}>
              {data?.status ?? '—'}
            </strong>
          </p>
        </section>

        {/* STATS — ratio + supply */}
        <div className="stats-grid">
          <div className="stat-card">
            <div className="label">Collateralization ratio</div>
            <div className={`value ${ratioClass}`}>
              {loading && !data ? '—' : `${ratio}%`}
            </div>
          </div>
          <div className="stat-card">
            <div className="label">Total VEZ supply</div>
            <div className="value">
              {loading && !data ? '—' : supply}
              <span style={{ fontSize: '0.55em', color: 'var(--text-3)', marginLeft: 6 }}>
                VEZ
              </span>
            </div>
          </div>
        </div>

        {/* CONTRACT INFO */}
        <section className="card">
          <div className="card-header">
            <h2>Contract info</h2>
            <a
              href={`https://slu-charene.vyft-one.com`}
              target="_blank"
              rel="noreferrer"
              style={{ fontSize: '0.8rem' }}
            >
              RPC · chain {data?.chainId ?? 45057}
            </a>
          </div>
          <div className="card-body">
            <div className="detail-grid">
              <div className="detail-field">
                <div className="lab">Data source</div>
                <div className="val">EAC Aggregator (PoR oracle)</div>
              </div>
              <div className="detail-field">
                <div className="lab">Oracle contract</div>
                <div className="val mono">
                  {oracle}
                  <button type="button" className="copy-btn" onClick={() => copyText(oracle)}>
                    Copy
                  </button>
                </div>
              </div>
              <div className="detail-field">
                <div className="lab">VEZ proxy</div>
                <div className="val mono">
                  {vez}
                  <button type="button" className="copy-btn" onClick={() => copyText(vez)}>
                    Copy
                  </button>
                </div>
              </div>
              <div className="detail-field">
                <div className="lab">Custodian</div>
                <div className="val mono">
                  {custodian}
                  <button type="button" className="copy-btn" onClick={() => copyText(custodian)}>
                    Copy
                  </button>
                </div>
              </div>
              <div className="detail-field">
                <div className="lab">Latest block</div>
                <div className="val">{blockNumber || '—'}</div>
              </div>
              <div className="detail-field">
                <div className="lab">Function</div>
                <div className="val mono">latestRoundData()</div>
              </div>
              <div className="detail-field">
                <div className="lab">Oracle deployed</div>
                <div className="val">{data?.oracleDeployed ? 'Yes' : 'No'}</div>
              </div>
              <div className="detail-field">
                <div className="lab">Supply source</div>
                <div className="val">{data?.supplySource || '—'}</div>
              </div>
            </div>
          </div>
        </section>

        {/* HOLDINGS TABLE */}
        {data?.balances && Object.keys(data.balances).length > 0 && (
          <section className="card">
            <div className="card-header">
              <h2>VEZ holdings breakdown</h2>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-3)' }}>
                eth_getBalance
              </span>
            </div>
            <div className="card-body">
              <table className="holdings">
                <thead>
                  <tr>
                    <th>Address</th>
                    <th>Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(data.balances).map(([addr, bal]) => (
                    <tr key={addr}>
                      <td className="mono">
                        {addr}
                        <button
                          type="button"
                          className="copy-btn"
                          onClick={() => copyText(addr)}
                        >
                          Copy
                        </button>
                      </td>
                      <td>
                        {bal} <span style={{ color: 'var(--text-3)' }}>VEZ</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* ISSUANCE */}
        <section className="card">
          <div className="card-header">
            <h2>Issuance (mint)</h2>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-3)' }}>
              1:1 EUR reserve cap
            </span>
          </div>
          <div className="card-body">
            <p style={{ fontSize: '0.8rem', color: 'var(--text-2)', marginBottom: '1rem' }}>
              Mint limited by oracle reserve ({reserve} EUR) minus circulating supply ({supply}{' '}
              VEZ). Requires CUSTODIAN_PRIVATE_KEY on the API host.
            </p>
            <form className="form-row" onSubmit={handleMint}>
              <label className="field" style={{ flex: 2 }}>
                <span>Recipient</span>
                <input
                  value={mintTo}
                  onChange={(e) => setMintTo(e.target.value)}
                  placeholder="0x…"
                  required
                />
              </label>
              <label className="field" style={{ maxWidth: 140 }}>
                <span>Amount (VEZ)</span>
                <input
                  value={mintAmount}
                  onChange={(e) => setMintAmount(e.target.value)}
                  required
                />
              </label>
              <button type="submit" className="btn btn-primary" disabled={minting}>
                {minting ? 'Minting…' : 'Mint'}
              </button>
            </form>
            {mintMsg && (
              <p className={`msg ${mintMsg.startsWith('OK') ? 'ok' : 'err'}`}>{mintMsg}</p>
            )}
          </div>
        </section>

        {error && <div className="alert error">{error}</div>}
        {data?.warnings && data.warnings.length > 0 && (
          <div className="alert warn">
            {data.warnings.map((w) => (
              <div key={w}>{w}</div>
            ))}
          </div>
        )}
      </main>

      <footer className="por-footer">
        <p>
          Sources: {(data?.sources || []).join(', ') || 'on-chain'} · Layout inspired by{' '}
          <a href="https://por.worldlibertyfinancial.com/" target="_blank" rel="noreferrer">
            USD1 Proof of Reserves
          </a>
          {' · '}
          <a href="https://vyft-one.com" target="_blank" rel="noreferrer">
            Vyft
          </a>
        </p>
      </footer>
    </div>
  )
}
