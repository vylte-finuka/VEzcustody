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
  if (totalSupply > 0n && reserve > 0n) {
    ratio = Number((reserve * 10000n) / totalSupply) / 100
  }
  const isBacked = ratio >= 99.5

  return {
    totalSupply: formatVez(totalSupply),
    reserve: formatVez(reserve),
    ratio: ratio.toFixed(2),
    isBacked,
    status: isBacked ? 'Fully Backed' : reserve > 0n ? 'Partial' : 'Under Backed / No Oracle',
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
      // 1) API serveur si déployée
      try {
        const res = await fetch('/api/por', { cache: 'no-store' })
        if (res.ok) {
          const json = await res.json()
          if (json?.ok) {
            setData({
              totalSupply: json.totalSupply,
              reserve: json.reserveAnswer,
              ratio: json.reserveRatio,
              isBacked: json.isBacked,
              status: json.status,
              custodian: json.custodian,
              custodianBal: json.balances?.[json.custodian?.toLowerCase()] || '0',
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
        /* fallback client */
      }

      // 2) Fallback navigateur → RPC (CORS *)
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
  const statusLabel = data?.status ?? (loading ? 'Chargement…' : 'Under Backed')

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
          json.error +
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
    <main className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white">
      <header className="border-b border-slate-700 bg-slate-900/80 backdrop-blur">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center font-bold text-lg">
              VEZ
            </div>
            <div>
              <h1 className="text-xl font-bold">VEZ Stablecoin</h1>
              <p className="text-xs text-slate-400">Proof of Reserves — Slura Chain (EUR)</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${isBacked ? 'bg-green-500' : 'bg-red-500'}`} />
            <span className="text-sm text-slate-300">{statusLabel}</span>
            <button
              type="button"
              onClick={fetchData}
              className="ml-3 text-xs px-2 py-1 rounded border border-slate-600 hover:bg-slate-800"
            >
              Refresh
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-4 py-8">
        {loading && !data && (
          <p className="text-slate-400 mb-6 text-sm">Chargement des données PoR…</p>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-6">
            <p className="text-sm text-slate-400 mb-2">Total VEZ Supply</p>
            <p className="text-3xl font-bold text-blue-400">{supply}</p>
            <p className="text-xs text-slate-500 mt-1">
              VEZ {data?.supplySource ? `· via ${data.supplySource}` : ''}
            </p>
          </div>
          <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-6">
            <p className="text-sm text-slate-400 mb-2">Reserve Backing</p>
            <p className="text-3xl font-bold text-green-400">{reserve}</p>
            <p className="text-xs text-slate-500 mt-1">EUR equivalent (oracle answer)</p>
          </div>
          <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-6">
            <p className="text-sm text-slate-400 mb-2">Reserve Ratio</p>
            <p className={`text-3xl font-bold ${isBacked ? 'text-green-400' : 'text-red-400'}`}>
              {ratio}%
            </p>
            <p className="text-xs text-slate-500 mt-1">1 VEZ = {ratio}% EUR backed</p>
          </div>
        </div>

        <div className="bg-slate-800/30 border border-slate-700 rounded-xl p-6 mb-8">
          <h2 className="text-lg font-semibold mb-4">Contract Information</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-slate-400">Custodian (mint holder)</p>
              <p className="font-mono text-xs break-all text-blue-300">
                {data?.custodian ?? CUSTODIAN}
              </p>
              <p className="text-xs text-slate-500 mt-1">Balance: {data?.custodianBal ?? '—'} VEZ</p>
            </div>
            <div>
              <p className="text-slate-400">Proxy Contract</p>
              <p className="font-mono text-xs break-all text-blue-300">
                {data?.vezProxy ?? VEZ}
              </p>
            </div>
            <div>
              <p className="text-slate-400">Aggregator (PoR oracle)</p>
              <p className="font-mono text-xs break-all text-blue-300">
                {data?.aggregator ?? AGG}
              </p>
              <p className="text-xs text-slate-500 mt-1">
                {data?.oracleDeployed ? 'Déployé' : 'Non déployé / eth_call KO'}
              </p>
            </div>
            <div>
              <p className="text-slate-400">Chaîne</p>
              <p className="text-slate-200">Slura (ID: {data?.chainId ?? 45057}) — EUR</p>
            </div>
          </div>
        </div>

        {data?.balances && Object.keys(data.balances).length > 0 && (
          <div className="bg-slate-800/30 border border-slate-700 rounded-xl p-6 mb-8">
            <h2 className="text-lg font-semibold mb-4">Soldes natifs (eth_getBalance)</h2>
            <ul className="space-y-2 text-sm font-mono">
              {Object.entries(data.balances).map(([addr, bal]) => (
                <li
                  key={addr}
                  className="flex justify-between gap-4 border-b border-slate-700/50 pb-1"
                >
                  <span className="text-blue-300 break-all">{addr}</span>
                  <span className="text-slate-200 whitespace-nowrap">{bal} VEZ</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-6 mb-8">
          <h2 className="text-lg font-semibold mb-2">Mint VEZ (réserve EUR)</h2>
          <p className="text-xs text-slate-400 mb-4">
            Mint limité par la réserve oracle (EAC latestRoundData). Côté serveur :
            CUSTODIAN_PRIVATE_KEY + VEZ_PROXY_ADDRESS (défaut 0xeee…e).
          </p>
          <form onSubmit={handleMint} className="flex flex-col md:flex-row gap-3 items-start md:items-end">
            <label className="flex-1 w-full">
              <span className="text-xs text-slate-400">Destinataire</span>
              <input
                className="mt-1 w-full bg-slate-900 border border-slate-600 rounded px-3 py-2 font-mono text-xs"
                value={mintTo}
                onChange={(e) => setMintTo(e.target.value)}
                placeholder="0x…"
                required
              />
            </label>
            <label className="w-full md:w-40">
              <span className="text-xs text-slate-400">Montant (VEZ)</span>
              <input
                className="mt-1 w-full bg-slate-900 border border-slate-600 rounded px-3 py-2 font-mono text-sm"
                value={mintAmount}
                onChange={(e) => setMintAmount(e.target.value)}
                placeholder="1.0"
                required
              />
            </label>
            <button
              type="submit"
              disabled={minting}
              className="px-4 py-2 rounded bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-sm font-semibold"
            >
              {minting ? 'Mint…' : 'Mint'}
            </button>
          </form>
          {mintMsg && (
            <p className={`mt-3 text-sm break-all ${mintMsg.startsWith('OK') ? 'text-green-400' : 'text-red-400'}`}>
              {mintMsg}
            </p>
          )}
        </div>

        {error && (
          <div className="bg-red-900/30 border border-red-700 rounded-xl p-4 mb-6">
            <p className="text-red-400 text-sm">{error}</p>
          </div>
        )}

        {data?.warnings && data.warnings.length > 0 && (
          <div className="bg-amber-900/20 border border-amber-700/50 rounded-xl p-4 mb-6">
            <p className="text-amber-300 text-sm font-semibold mb-2">Avertissements</p>
            <ul className="list-disc list-inside text-amber-200/80 text-xs space-y-1">
              {data.warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="text-center text-slate-500 text-sm">
          <p>
            Dernière mise à jour :{' '}
            {data?.fetchedAt
              ? new Date(data.fetchedAt).toLocaleString('fr-FR')
              : loading
                ? 'Chargement...'
                : '—'}
          </p>
          <p className="mt-1">
            Sources : {(data?.sources || []).join(', ') || '—'} · RPC navigateur + /api/por
          </p>
        </div>
      </div>
    </main>
  )
}
