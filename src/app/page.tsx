use client'

import { useCallback, useEffect, useState } from 'react'

type PorResponse = {
  ok: boolean
  chainId?: number
  rpc?: string
  vezProxy?: string
  aggregator?: string
  oracleDeployed?: boolean
  custodian?: string
  totalSupply?: string
  supplySource?: string
  balances?: Record<string, string>
  reserveAnswer?: string
  reserveRatio?: string
  isBacked?: boolean
  status?: string
  roundId?: string
  updatedAt?: string | null
  sources?: string[]
  warnings?: string[]
  fetchedAt?: string
  error?: string
}

function shortAddr(a?: string) {
  if (!a) return '—'
  return `${a.slice(0, 6)}…${a.slice(-4)}`
}

export default function Home() {
  const [data, setData] = useState<PorResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/por', { cache: 'no-store' })
      const json = (await res.json()) as PorResponse
      if (!json.ok) {
        setError(json.error || 'Impossible de charger le PoR')
        setData(json)
      } else {
        setError('')
        setData(json)
      }
    } catch (e) {
      console.error(e)
      setError('Impossible de joindre /api/por (réseau ou build)')
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
  const reserve = data?.reserveAnswer ?? '0'
  const ratio = data?.reserveRatio ?? '0'
  const isBacked = data?.isBacked ?? false
  const statusLabel = data?.status ?? (loading ? 'Chargement…' : 'Under Backed')
  const custKey = data?.custodian?.toLowerCase() ?? ''

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
                {data?.custodian ?? '0x53ae54b11251d5003e9aa51422405bc35a2ef32d'}
              </p>
              <p className="text-xs text-slate-500 mt-1">
                Balance: {data?.balances?.[custKey] ?? '—'} VEZ
              </p>
            </div>
            <div>
              <p className="text-slate-400">Proxy Contract</p>
              <p className="font-mono text-xs break-all text-blue-300">
                {data?.vezProxy ?? '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee'}
              </p>
            </div>
            <div>
              <p className="text-slate-400">Aggregator (PoR oracle)</p>
              <p className="font-mono text-xs break-all text-blue-300">
                {data?.aggregator ?? '0xcccccccccccccccccccccccccccccccccccccccc'}
              </p>
              <p className="text-xs text-slate-500 mt-1">
                {data?.oracleDeployed ? 'Déployé' : 'Non déployé / eth_call KO'}
                {data?.roundId ? ` · round ${data.roundId}` : ''}
              </p>
            </div>
            <div>
              <p className="text-slate-400">Chaîne</p>
              <p className="text-slate-200">
                Slura (ID: {data?.chainId ?? 45057}) — EUR · RPC {shortAddr(data?.rpc)}
              </p>
            </div>
          </div>
        </div>

        {data?.balances && Object.keys(data.balances).length > 0 && (
          <div className="bg-slate-800/30 border border-slate-700 rounded-xl p-6 mb-8">
            <h2 className="text-lg font-semibold mb-4">Soldes natifs (eth_getBalance)</h2>
            <ul className="space-y-2 text-sm font-mono">
              {Object.entries(data.balances).map(([addr, bal]) => (
                <li key={addr} className="flex justify-between gap-4 border-b border-slate-700/50 pb-1">
                  <span className="text-blue-300 break-all">{addr}</span>
                  <span className="text-slate-200 whitespace-nowrap">{bal} VEZ</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {error && (
          <div className="bg-red-900/30 border border-red-700 rounded-xl p-4 mb-6">
            <p className="text-red-400 text-sm">{error}</p>
          </div>
        )}

        {data?.warnings && data.warnings.length > 0 && (
          <div className="bg-amber-900/20 border border-amber-700/50 rounded-xl p-4 mb-6">
            <p className="text-amber-300 text-sm font-semibold mb-2">Avertissements nœud / contrats</p>
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
            Sources : {(data?.sources || []).join(', ') || '—'} · API <code>/api/por</code>
          </p>
        </div>
      </div>
    </main>
  )
}
