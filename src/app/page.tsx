'use client'

import { useEffect, useState, useCallback } from 'react'
import { createPublicClient, http, parseEther } from 'viem'
import { VEZ_PROXY_ABI, AGGREGATOR_ABI } from '@/lib/contracts/abi'
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from 'wagmi'

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
  const [reserveProof, setReserveProof] = useState<string>('0')
  const [loading, setLoading] = useState(true)
  const [mintAmount, setMintAmount] = useState<string>('')
  const [mintAddress, setMintAddress] = useState<string>('')

  const { address: userAddress } = useAccount()
  const { data: hash, error, isPending, writeContract } = useWriteContract()
  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({
    hash,
  })

  const fetchData = useCallback(async () => {
    try {
      const supply = (await client.readContract({
        address: VEZ_PROXY_ADDRESS,
        abi: VEZ_PROXY_ABI,
        functionName: 'totalSupply',
        args: [],
      })) as bigint
      setVezSupply(supply.toString())

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
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  useEffect(() => {
    if (isConfirmed) {
      alert('Mint effectué avec succès!')
      fetchData()
    }
  }, [isConfirmed, fetchData])

  useEffect(() => {
    if (error) {
      console.error('Mint error:', error)
      alert('Erreur lors du mint: ' + error.message)
    }
  }, [error])

  if (loading) return <div>Chargement...</div>

  return (
    <main className="flex min-h-screen flex-col items-center justify-between p-24">
      <div className="text-center">
        <h1 className="mb-6 text-4xl font-bold">VEZ Stablecoin Dashboard</h1>
        <p className="mb-4">Total VEZ Supply: {vezSupply} VEZ</p>
        <p className="mb-4">Reserve Proof: {reserveProof}</p>
        
        <div className="mt-6">
          <h2 className="text-xl font-semibold">Mint VEZ</h2>
          <p className="text-sm text-muted-foreground">
            Le validateur peut mint illimité (sauf limite MAX_MINT_PER_TX)
          </p>
          <div className="flex flex-col sm:flex-row gap-4 mt-4">
            <input
              type="number"
              className="border rounded px-3 py-2 flex-1"
              value={mintAmount}
              onChange={(e) => setMintAmount(e.target.value)}
              placeholder="Montant (VEZ)"
            />
            <input
              type="text"
              className="border rounded px-3 py-2 flex-1"
              value={mintAddress}
              onChange={(e) => setMintAddress(e.target.value)}
              placeholder="Adresse du validateur"
            />
            <button
              onClick={() => {
                if (mintAddress && mintAmount && userAddress) {
                  writeContract({
                    address: VEZ_PROXY_ADDRESS,
                    abi: VEZ_PROXY_ABI,
                    functionName: 'mint',
                    args: [mintAddress, parseEther(mintAmount)],
                  })
                }
              }}
              disabled={isPending || isConfirming || !mintAddress || !mintAmount}
              className="bg-blue-600 text-white px-6 py-2 rounded hover:bg-blue-700 disabled:opacity-50"
            >
              {isPending || isConfirming ? 'En cours...' : 'Mint VEZ'}
            </button>
          </div>
        </div>
      </div>
      <div>
        <p className="text-sm text-muted-foreground">
          Dernière mise à jour: {new Date().toLocaleTimeString()}
        </p>
      </div>
    </main>
  )
}