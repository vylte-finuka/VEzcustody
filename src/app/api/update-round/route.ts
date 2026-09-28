import { NextRequest, NextResponse } from 'next/server'
import { http, createWalletClient } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { AGGREGATOR_ABI } from '@/lib/contracts/abi'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { answer } = body

    if (answer === undefined) {
      return NextResponse.json({ error: 'Missing answer' }, { status: 400 })
    }

    const SLURA_RPC_URL = process.env.SLURA_RPC_URL || 'http://localhost:8081'
    const EAC_AGGREGATOR_ADDRESS = process.env.EAC_AGGREGATOR_ADDRESS as `0x${string}`
    const CUSTODIAN_PRIVATE_KEY = process.env.CUSTODIAN_PRIVATE_KEY as `0x${string}`

    if (!EAC_AGGREGATOR_ADDRESS || !CUSTODIAN_PRIVATE_KEY) {
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })
    }

    // Timestamp système (la chaîne Slura ne produit pas de blocs sans validateur)
    const timestamp = Math.floor(Date.now() / 1000)

    const account = privateKeyToAccount(CUSTODIAN_PRIVATE_KEY)
    const walletClient = createWalletClient({
      account,
      chain: {
        id: 45057,
        name: 'Slura',
        nativeCurrency: { name: 'VEZ', symbol: 'VEZ', decimals: 18 },
        rpcUrls: { default: { http: [SLURA_RPC_URL] } },
      } as const,
      transport: http(SLURA_RPC_URL),
    })

    const hash = await walletClient.writeContract({
      address: EAC_AGGREGATOR_ADDRESS,
      abi: AGGREGATOR_ABI,
      functionName: 'updateRoundData',
      args: [BigInt(answer), BigInt(timestamp)],
    })

    return NextResponse.json({
      status: 'round_updated',
      txHash: hash,
      answer,
      timestamp,
      message: 'Oracle round data updated on Slura chain via Next.js DON',
    })
  } catch (error) {
    console.error('Update round error:', error)
    return NextResponse.json({ error: 'Update failed' }, { status: 500 })
  }
}