import type { Abi } from 'viem'

/** ABI minimal aligné sur vezcurproxy.sol (VEZproxy) */
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
    outputs: [{ name: '', type: 'bool' }],
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
  {
    name: 'owner',
    type: 'function',
    inputs: [],
    stateMutability: 'view',
    outputs: [{ name: '', type: 'address' }],
  },
  {
    name: 'me',
    type: 'function',
    inputs: [],
    stateMutability: 'view',
    outputs: [{ name: '', type: 'address' }],
  },
  {
    name: 'priceFeed',
    type: 'function',
    inputs: [],
    stateMutability: 'view',
    outputs: [{ name: '', type: 'address' }],
  },
  {
    name: 'complet_quant',
    type: 'function',
    inputs: [],
    stateMutability: 'view',
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'isCustodian',
    type: 'function',
    inputs: [{ name: 'account', type: 'address' }],
    stateMutability: 'view',
    outputs: [{ name: '', type: 'bool' }],
  },
] as const
