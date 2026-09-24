import type { Abi } from 'viem'

export const VEZ_PROXY_ABI: Abi = [
  {
    name: 'mint',
    type: 'function',
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    stateMutability: 'nonpayable',
    outputs: [],
  },
  {
    name: 'transfer',
    type: 'function',
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    stateMutability: 'nonpayable',
    outputs: [],
  },
  {
    name: 'obtain',
    type: 'function',
    inputs: [
      { name: 'amount', type: 'uint256' },
      { name: 'proof', type: 'string' },
    ],
    stateMutability: 'nonpayable',
    outputs: [],
  },
  {
    name: 'balanceOf',
    type: 'function',
    inputs: [{ name: 'account', type: 'address' }],
    stateMutability: 'view',
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'totalSupply',
    type: 'function',
    inputs: [],
    stateMutability: 'view',
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const
