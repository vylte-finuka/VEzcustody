import type { Abi } from 'viem'

export const AGGREGATOR_ABI: Abi = [
  {
    name: 'getFullRoundData',
    type: 'function',
    inputs: [],
    stateMutability: 'view',
    outputs: [
      { name: 'roundId', type: 'uint80' },
      { name: 'answer', type: 'int256' },
      { name: 'startedAt', type: 'uint256' },
      { name: 'updatedAt', type: 'uint256' },
      { name: 'answeredInRound', type: 'uint80' },
    ],
  },
  {
    name: 'updateRoundData',
    type: 'function',
    inputs: [
      { name: '_answer', type: 'int256' },
      { name: '_timestamp', type: 'uint256' },
    ],
    stateMutability: 'nonpayable',
    outputs: [],
  },
  {
    name: 'latestRoundData',
    type: 'function',
    inputs: [],
    stateMutability: 'view',
    outputs: [
      { name: 'roundId', type: 'uint80' },
      { name: 'answer', type: 'int256' },
      { name: 'startedAt', type: 'uint256' },
      { name: 'updatedAt', type: 'uint256' },
      { name: 'answeredInRound', type: 'uint80' },
    ],
  },
] as const
