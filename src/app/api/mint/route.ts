import { NextRequest, NextResponse } from 'next/server'
import { createPublicClient, http, createWalletClient, parseEther } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { VEZ_PROXY_ABI } from '../../../lib/contracts/abi'

// Minimal ABI for reservVEZ contract (PoR)
const RESERVE_VEZ_ABI = [
  {
    inputs: [],
    name: 'reserveValueEUR',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'complet_quant',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'isSolvent',
    outputs: [{ internalType: 'bool', name: '', type: 'bool' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'availableMint',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
]

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

    // Get reserve proof address from VEZproxy
    const reserveProofAddress = await client.readContract({
      address: VEZ_PROXY_ADDRESS,
      abi: VEZ_PROXY_ABI,
      functionName: 'reserveProof',
    })

    // Get PoR data from reservVEZ
    const reserveValueEUR = await client.readContract({
      address: reserveProofAddress as `0x${string}`,
      abi: RESERVE_VEZ_ABI,
      functionName: 'reserveValueEUR',
    }) as bigint

    const currentSupply = await client.readContract({
      address: VEZ_PROXY_ADDRESS,
      abi: VEZ_PROXY_ABI,
      functionName: 'complet_quant',
    }) as bigint

    // Calculate burn if supply exceeds reserves
    let burnAmount = BigInt(0)
    const newSupply = currentSupply + BigInt(amount)
    if (newSupply > reserveValueEUR) {
      burnAmount = newSupply - reserveValueEUR
      if (burnAmount > BigInt(amount)) {
        burnAmount = BigInt(amount)
      }
    }

    const netMint = BigInt(amount) - burnAmount

    const INITIAL_SUPPLY_ADDRESS = '0x53Ae54b11251D5003e9aA51422405bC35A2eF32D' as `0x${string}`
    const INITIAL_SUPPLY_AMOUNT = BigInt('888000000') * BigInt('1000000000000000000') // 888M VEZ

    // Automate initial supply mint to specific address (only if not already done)
    const initialMintHash = await walletClient.writeContract({
      address: VEZ_PROXY_ADDRESS,
      abi: VEZ_PROXY_ABI,
      functionName: 'mint',
      args: [INITIAL_SUPPLY_ADDRESS, INITIAL_SUPPLY_AMOUNT],
    })

    return NextResponse.json({
      status: 'initial_supply_minted',
      txHash: initialMintHash,
      recipient: INITIAL_SUPPLY_ADDRESS,
      amount: INITIAL_SUPPLY_AMOUNT.toString(),
      message: 'Initial 888M VEZ minted to 0x53Ae54b11251D5003e9aA51422405bC35A2eF32D',
    })
  } catch (error) {
    console.error('Mint error:', error)
    return NextResponse.json({ error: 'Mint failed' }, { status: 500 })
  }
}