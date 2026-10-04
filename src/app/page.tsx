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


export default function Home() {
  const [data, setData] = useState<PorView | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [mintTo, setMintTo] = useState(CUSTODIAN)
  const [mintAmount, setMintAmount] = useState('1')
  const [minting, setMinting] = useState(false)
  const [mintMsg, setMintMsg] = useState('')

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
            const supplyN = parseFloat(supplyStr) || 0
            const reserveN = parseFloat(reserveStr) || 0
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
      console.error(e)
      setError(e instanceof Error ? e.message : 'Erreur chargement PoR')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
    const id = setInterval(fetchData, 30_000)
    return () => clearInterval(id)
  }, [fetchData])

  const supply = data?.totalSupply ?? '0'
  const reserve = data?.reserve ?? '0'
  const ratio = data?.ratio ?? '0'
  const isBacked = data?.isBacked ?? false
  const statusLabel = data?.status ?? (loading ? 'Chargement…' : '—')

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
              ? ` (dispo: ${json.availableToMint} VEZ, réserve: ${json.reserveEUR} EUR)`
              : '') +
            (json.detail ? ` — ${json.detail}` : '')
        )
      } else {
        setMintMsg(`OK: ${json.message || 'minté'} · tx ${json.txHash}`)
        await fetchData()
      }
    } catch (err) {
      setMintMsg(err instanceof Error ? err.message : 'Erreur mint')
    } finally {
      setMinting(false)
    }
  }

  return (
    <div className="vyft-shell">
      <header className="vyft-header">
        <div className="vyft-header-inner">
          <div className="vyft-brand">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/vyft.png" alt="Vyft" className="vyft-logo" />
            <div>
              <h1>VEZ Stablecoin</h1>
              <p>Proof of Reserves — Slura · design Vyft</p>
            </div>
          </div>
          <div className="vyft-status">
            <span className={`vyft-dot${isBacked ? ' ok' : ''}`} />
            <span>{statusLabel}</span>
            <button type="button" className="vyft-btn vyft-btn-ghost" onClick={fetchData}>
              Refresh
            </button>
          </div>
        </div>
      </header>

      <main className="vyft-main">
        <p className="vyft-lead">
          {loading ? 'Chargement des données PoR…' : 'Réserves EUR (oracle EAC) vs supply VEZ on-chain.'}
        </p>

        <div className="vyft-grid">
          <div className="vyft-card">
            <label>Total VEZ Supply</label>
            <div className="val blue">{supply}</div>
            <div className="hint">VEZ · {data?.supplySource || '—'}</div>
          </div>
          <div className="vyft-card">
            <label>Reserve Backing</label>
            <div className="val green">{reserve}</div>
            <div className="hint">EUR (oracle latestRoundData)</div>
          </div>
          <div className="vyft-card">
            <label>Reserve Ratio</label>
            <div className={`val ${isBacked ? 'green' : 'red'}`}>{ratio}%</div>
            <div className="hint">1 VEZ ↔ couverture EUR</div>
          </div>
        </div>

        <div className="vyft-card" style={{ marginBottom: '1.5rem' }}>
          <h2>Informations contrat</h2>
          <div className="vyft-grid">
            <div>
              <div className="vyft-muted">Custodian</div>
              <div className="vyft-mono">{data?.custodian ?? CUSTODIAN}</div>
              <div className="vyft-muted" style={{ marginTop: 4 }}>
                Solde : {data?.custodianBal ?? '—'} VEZ
              </div>
            </div>
            <div>
              <div className="vyft-muted">Proxy VEZ</div>
              <div className="vyft-mono">{data?.vezProxy ?? VEZ}</div>
            </div>
            <div>
              <div className="vyft-muted">Oracle EAC (PoR)</div>
              <div className="vyft-mono">{data?.aggregator ?? AGG}</div>
              <div className="vyft-muted" style={{ marginTop: 4 }}>
                {data?.oracleDeployed ? 'Déployé' : 'Non déployé'}
              </div>
            </div>
            <div>
              <div className="vyft-muted">Chaîne</div>
              <div>Slura · ID {data?.chainId ?? 45057} · EUR</div>
            </div>
          </div>
        </div>

        {data?.balances && Object.keys(data.balances).length > 0 && (
          <div className="vyft-card" style={{ marginBottom: '1.5rem' }}>
            <h2>Soldes (eth_getBalance)</h2>
            <table className="vyft-table">
              <tbody>
                {Object.entries(data.balances).map(([addr, bal]) => (
                  <tr key={addr}>
                    <td className="vyft-mono">{addr}</td>
                    <td>{bal} VEZ</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="vyft-card" style={{ marginBottom: '1.5rem' }}>
          <h2>Mint VEZ (réserve EUR)</h2>
          <p className="vyft-muted" style={{ marginBottom: '1rem' }}>
            Émission 1:1 · réserve {reserve} EUR · supply {supply} VEZ. Clé custodian côté serveur
            (Netlify).
          </p>
          <form className="vyft-form" onSubmit={handleMint}>
            <label className="vyft-field" style={{ flex: 2 }}>
              <span>Destinataire</span>
              <input
                value={mintTo}
                onChange={(e) => setMintTo(e.target.value)}
                placeholder="0x…"
                required
              />
            </label>
            <label className="vyft-field" style={{ maxWidth: 140 }}>
              <span>Montant (VEZ)</span>
              <input
                value={mintAmount}
                onChange={(e) => setMintAmount(e.target.value)}
                placeholder="1.0"
                required
              />
            </label>
            <button type="submit" className="vyft-btn" disabled={minting}>
              {minting ? 'Mint…' : 'Mint'}
            </button>
          </form>
          {mintMsg && (
            <p className={`vyft-msg ${mintMsg.startsWith('OK') ? 'ok' : 'err'}`}>{mintMsg}</p>
          )}
        </div>

        {error && <div className="vyft-alert error">{error}</div>}
        {data?.warnings && data.warnings.length > 0 && (
          <div className="vyft-alert warn">
            <strong>Avertissements</strong>
            <ul style={{ marginTop: 6, paddingLeft: '1.1rem' }}>
              {data.warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          </div>
        )}

        <footer className="vyft-footer">
          <p>
            MAJ :{' '}
            {data?.fetchedAt
              ? new Date(data.fetchedAt).toLocaleString('fr-FR')
              : loading
                ? '…'
                : '—'}
          </p>
          <p style={{ marginTop: 4 }}>
            Sources : {(data?.sources || []).join(', ') || '—'} ·{' '}
            <a href="https://vyft-one.com" target="_blank" rel="noreferrer">
              vyft-one.com
            </a>
          </p>
        </footer>
      </main>
    </div>
  )
}
