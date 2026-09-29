'use client'

import { useEffect, useState } from 'react'
import { createPublicClient, http } from 'viem'
import { VEZ_PROXY_ABI, AGGREGATOR_ABI } from '@/lib/contracts/abi'

const SLURA_RPC_URL = process.env.NEXT_PUBLIC_SLURA_RPC_URL || 'https://slu-charene.vyft-one.com'
const VEZ_PROXY_ADDRESS = (process.env.NEXT_PUBLIC_VEZ_PROXY_ADDRESS || '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee') as `0x${string}`
const AGGREGATOR_ADDRESS = (process.env.NEXT_PUBLIC_AGGREGATOR_ADDRESS || '0xcccccccccccccccccccccccccccccccccccccccc') as `0x${string}`

const client = createPublicClient({
  chain: {
    id: 45057,
    name: 'Slura',
    nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
    rpcUrls: { default: { http: [SLURA_RPC_URL] } },
  } as const,
  transport: http(SLURA_RPC_URL),
})

export default function Home() {
  const [vezSupply, setVezSupply] = useState<string>('0')
  const [reserveProof, setReserveProof] = useState<string>('0')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchData = async () => {
      try {
        // Récupérer le total supply de VEZ
        const supply = (await client.readContract({
          address: VEZ_PROXY_ADDRESS,
          abi: VEZ_PROXY_ABI,
          functionName: 'totalSupply',
          args: [],
        })) as bigint
        setVezSupply(supply.toString())

        // Récupérer la preuve de réserve
        const roundData = (await client.readContract({
          address: AGGREGATOR_ADDRESS,
          abi: AGGREGATOR_ABI,
          functionName: 'getFullRoundData',
          args: [],
        })) as [bigint, bigint, bigint, bigint, bigint]

        setReserveProof((roundData as any)[1].toString())
      } catch (error) {
        console.error('Error fetching data:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [])

  if (loading) return <div>Chargement...</div>

  return (
    <main className="flex min-h-screen flex-col items-center justify-between p-24">
      <div className="text-center">
        <h1 className="mb-6 text-4xl font-bold">VEZ Stablecoin Dashboard</h1>
        <p className="mb-4">Total VEZ Supply: {vezSupply} VEZ</p>
        <p className="mb-4">Reserve Proof: {reserveProof}</p>
      </div>
      <div>
        <p className="text-sm text-muted-foreground">
          Dernière mise à jour: {new Date().toLocaleTimeString()}
        </p>
      </div>
    </main>
  )
}