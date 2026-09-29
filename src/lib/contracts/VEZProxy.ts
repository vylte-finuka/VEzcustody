import { createPublicClient, http } from 'viem'
import { VEZ_PROXY_ABI } from './abi/VEZproxy'

const SLURA_RPC_URL = process.env.SLURA_RPC_URL || 'https://slu-charene.vyft-one.com'
const VEZ_PROXY_ADDRESS = process.env.VEZ_PROXY_ADDRESS as `0x${string}`

export class VEZProxy {
  private client: ReturnType<typeof createPublicClient>

  constructor() {
    this.client = createPublicClient({
      chain: {
        id: 45057,
        name: 'Slura',
        nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
        rpcUrls: { default: { http: [SLURA_RPC_URL] } },
      } as const,
      transport: http(SLURA_RPC_URL),
    })
  }

  async totalSupply(): Promise<bigint> {
    return (await this.client.readContract({
      address: VEZ_PROXY_ADDRESS,
      abi: VEZ_PROXY_ABI,
      functionName: 'totalSupply',
      args: [],
    })) as bigint
  }

  async balanceOf(address: string): Promise<bigint> {
    return (await this.client.readContract({
      address: VEZ_PROXY_ADDRESS,
      abi: VEZ_PROXY_ABI,
      functionName: 'balanceOf',
      args: [address as `0x${string}`],
    })) as bigint
  }

  async mint(recipient: string, amount: bigint): Promise<`0x${string}`> {
    // Mint requires custodian private key - use server action or API route
    throw new Error('Mint requires custodian signing - use POST /api/mint')
  }
}