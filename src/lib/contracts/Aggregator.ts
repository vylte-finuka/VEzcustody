import { createPublicClient, http } from 'viem'

const SLURA_RPC_URL = process.env.SLURA_RPC_URL || 'https://slu-charene.vyft-one.com'
const AGGREGATOR_ADDRESS = process.env.AGGREGATOR_ADDRESS as `0x${string}`

// ABI simplifié pour EACAggregatorProxy
const AGGREGATOR_ABI = [
  {
    inputs: [],
    name: 'getFullRoundData',
    outputs: [
      { internalType: 'uint80', name: 'roundId', type: 'uint80' },
      { internalType: 'int256', name: 'answer', type: 'int256' },
      { internalType: 'uint256', name: 'startedAt', type: 'uint256' },
      { internalType: 'uint256', name: 'updatedAt', type: 'uint256' },
      { internalType: 'uint80', name: 'answeredInRound', type: 'uint80' },
    ],
    stateMutability: 'view',
    type: 'function',
  },
] as const

export class Aggregator {
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

  async getFullRoundData(): Promise<{
    roundId: bigint
    answer: bigint
    startedAt: bigint
    updatedAt: bigint
    answeredInRound: bigint
  }> {
    const result = await this.client.readContract({
      address: AGGREGATOR_ADDRESS,
      abi: AGGREGATOR_ABI,
      functionName: 'getFullRoundData',
      args: [],
    })

    return {
      roundId: result[0],
      answer: result[1],
      startedAt: result[2],
      updatedAt: result[3],
      answeredInRound: result[4],
    }
  }
}