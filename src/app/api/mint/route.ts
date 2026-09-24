import { NextRequest, NextResponse } from 'next/server'
import { createPublicClient, http, createWalletClient, parseEther } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { VEZ_PROXY_ABI } from '../../../lib/contracts/abi'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { recipient, amount } = body

    if (!recipient || !amount) {
      return NextResponse.json({ error: 'Missing recipient or amount' }, { status: 400 })
    }

    const SLURA_RPC_URL = process.env.SLURA_RPC_URL || 'https://slu-charene.vyft-one.com'
    const VEZ_PROXY_ADDRESS = process.env.VEZ_PROXY_ADDRESS as `0x${string}`
    const CUSTODIAN_PRIVATE_KEY = process.env.CUSTODIAN_PRIVATE_KEY as `0x${string}`

    if (!VEZ_PROXY_ADDRESS || !CUSTODIAN_PRIVATE_KEY) {
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })
    }

    const client = createPublicClient({
      chain: {
        id: 45057,
        name: 'Slura',
        nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
        rpcUrls: { default: { http: [SLURA_RPC_URL] } },
      } as const,
      transport: http(SLURA_RPC_URL),
    })

    const account = privateKeyToAccount(CUSTODIAN_PRIVATE_KEY)
    const walletClient = createWalletClient({
      account,
      chain: {
        id: 45057,
        name: 'Slura',
        nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
        rpcUrls: { default: { http: [SLURA_RPC_URL] } },
      } as const,
      transport: http(SLURA_RPC_URL),
    })

    // Mint via server-side contract interaction (no CRE needed)
    const hash = await walletClient.writeContract({
      address: VEZ_PROXY_ADDRESS,
      abi: VEZ_PROXY_ABI,
      functionName: 'mint',
      args: [recipient as `0x${string}`, BigInt(amount)],
    })

    return NextResponse.json({
      status: 'mint_submitted',
      txHash: hash,
      recipient,
      amount,
      message: 'Mint transaction submitted to Slura chain via Next.js DON',
    })
  } catch (error) {
    console.error('Mint error:', error)
    return NextResponse.json({ error: 'Mint failed' }, { status: 500 })
  }
}