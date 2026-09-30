'use client'

import { useEffect, useState } from 'react'
import { createPublicClient, http, formatEther } from 'viem'
import { VEZ_PROXY_ABI, AGGREGATOR_ABI } from '@/lib/contracts/abi'

const SLURA_RPC_URL = process.env.NEXT_PUBLIC_SLURA_RPC_URL || 'https://slu-charene.vyft-one.com'
const VEZ_PROXY_ADDRESS = (process.env.NEXT_PUBLIC_VEZ_PROXY_ADDRESS || '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee') as `0x${string}`
const AGGREGATOR_ADDRESS = (process.env.NEXT_PUBLIC_AGGREGATOR_ADDRESS || '0xcccccccccccccccccccccccccccccccccccccccc') as `0x${string}`

const client = createPublicClient({
  chain: {
    id: 45057,
    name: 'Slura',
    nativeCurrency: { name: 'Vyft Enhancing ZER', symbol: 'VEZ', decimals: 18 },
    rpcUrls: { default: { http: [SLURA_RPC_URL] } },
  } as const,
  transport: http(SLURA_RPC_URL),
})

export default function Home() {
  const [vezSupply, setVezSupply] = useState<string>('0')
  const [reserveAmount, setReserveAmount] = useState<string>('0')
  const [reserveRatio, setReserveRatio] = useState<string>('0')
  const [validator, setValidator] = useState<string>('0x...')
  const [lastUpdate, setLastUpdate] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string>('')

  const fetchData = async () => {
    try {
      const supply = (await client.readContract({
        address: VEZ_PROXY_ADDRESS,
        abi: VEZ_PROXY_ABI,
        functionName: 'totalSupply',
        args: [],
      })) as bigint
      setVezSupply(formatEther(supply))

      const roundData = (await client.readContract({
        address: AGGREGATOR_ADDRESS,
        abi: AGGREGATOR_ABI,
        functionName: 'getFullRoundData',
        args: [],
      })) as [bigint, bigint, bigint, bigint, bigint]

      const reserve = (roundData as any)[1]
      setReserveAmount(formatEther(reserve))

      const ratio = supply > BigInt(0) ? (reserve * BigInt(10000)) / supply : BigInt(0)
      setReserveRatio((Number(ratio) / 100).toFixed(2))

      const val = (await client.readContract({
        address: VEZ_PROXY_ADDRESS,
        abi: VEZ_PROXY_ABI,
        functionName: 'validator',
        args: [],
      })) as `0x${string}`
      setValidator(val)

      setLastUpdate(new Date().toLocaleString('fr-FR'))
      setError('')
    } catch (err) {
      console.error('Error fetching data:', err)
      setError('Impossible de charger les données du contrat')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
    const interval = setInterval(fetchData, 30000)
    return () => clearInterval(interval)
  }, [])

  const isBacked = parseFloat(reserveRatio) >= 100

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white">
      {/* Header */}
      <header className="border-b border-slate-700 bg-slate-900/80 backdrop-blur">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center font-bold text-lg">VEZ</div>
            <div>
              <h1 className="text-xl font-bold">VEZ Stablecoin</h1>
              <p className="text-xs text-slate-400">Proof of Reserves — Slura Chain (EUR)</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${isBacked ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} />
            <span className="text-sm text-slate-300">{isBacked ? 'Fully Backed' : 'Under Backed'}</span>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="max-w-6xl mx-auto px-4 py-8">
        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          {/* Total Supply */}
          <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-6">
            <p className="text-sm text-slate-400 mb-2">Total VEZ Supply</p>
            <p className="text-3xl font-bold text-blue-400">{vezSupply}</p>
            <p className="text-xs text-slate-500 mt-1">VEZ</p>
          </div>

          {/* Reserve Backing */}
          <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-6">
            <p className="text-sm text-slate-400 mb-2">Reserve Backing</p>
            <p className="text-3xl font-bold text-green-400">{reserveAmount}</p>
            <p className="text-xs text-slate-500 mt-1">EUR equivalent</p>
          </div>

          {/* Reserve Ratio */}
          <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-6">
            <p className="text-sm text-slate-400 mb-2">Reserve Ratio</p>
            <p className={`text-3xl font-bold ${isBacked ? 'text-green-400' : 'text-red-400'}`}>{reserveRatio}%</p>
            <p className="text-xs text-slate-500 mt-1">1 VEZ = {reserveRatio} EUR backed</p>
          </div>
        </div>

        {/* Validator & Contract Info */}
        <div className="bg-slate-800/30 border border-slate-700 rounded-xl p-6 mb-8">
          <h2 className="text-lg font-semibold mb-4">Contract Information</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-slate-400">Validator Address</p>
              <p className="font-mono text-xs break-all text-blue-300">{validator}</p>
            </div>
            <div>
              <p className="text-slate-400">Proxy Contract</p>
              <p className="font-mono text-xs break-all text-blue-300">{VEZ_PROXY_ADDRESS}</p>
            </div>
            <div>
              <p className="text-slate-400">Aggregator</p>
              <p className="font-mono text-xs break-all text-blue-300">{AGGREGATOR_ADDRESS}</p>
            </div>
            <div>
              <p className="text-slate-400">Chaîne</p>
              <p className="text-slate-200">Slura (ID: 45057) — EUR</p>
            </div>
          </div>
        </div>

        {/* Error / Status */}
        {error && (
          <div className="bg-red-900/30 border border-red-700 rounded-xl p-4 mb-6">
            <p className="text-red-400 text-sm">{error}</p>
          </div>
        )}

        {/* Footer */}
        <div className="text-center text-slate-500 text-sm">
          <p>Dernière mise à jour : {lastUpdate || 'Chargement...'}</p>
          <p className="mt-1">Données lues directement depuis le contrat intelligent</p>
        </div>
      </div>
    </main>
  )
}