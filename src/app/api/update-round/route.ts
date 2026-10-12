import { NextRequest, NextResponse } from 'next/server'
import {
  http,
  createWalletClient,
  encodeFunctionData,
  type Hex,
  type Address,
} from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { AGGREGATOR_ABI } from '@/lib/contracts/abi'

const RPC = process.env.SLURA_RPC_URL || 'https://slu-charene.vyft-one.com'
const ORACLE = (process.env.EAC_AGGREGATOR_ADDRESS ||
  process.env.NEXT_PUBLIC_AGGREGATOR_ADDRESS ||
  '0xcccccccccccccccccccccccccccccccccccccccc') as Address

const SLURA = {
  id: 45057,
  name: 'Slura',
  nativeCurrency: { name: 'VEZ', symbol: 'VEZ', decimals: 18 },
  rpcUrls: { default: { http: [RPC] as const }, public: { http: [RPC] as const } },
} as const

async function rpc<T = unknown>(method: string, params: unknown[] = []): Promise<T> {
  const res = await fetch(RPC, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    cache: 'no-store',
  })
  if (!res.ok) throw new Error(`RPC HTTP ${res.status}`)
  const json = (await res.json()) as { result?: T; error?: { message?: string } }
  if (json.error) throw new Error(json.error.message || 'RPC error')
  return json.result as T
}

/** Accept number | string | bigint-like; never lose precision via Number */
function parseAnswer(raw: unknown): bigint {
  if (typeof raw === 'bigint') return raw
  if (typeof raw === 'number') {
    if (!Number.isFinite(raw)) throw new Error('answer is not a finite number')
    // unsafe beyond 2^53-1 — prefer string
    return BigInt(Math.trunc(raw))
  }
  if (typeof raw === 'string') {
    const s = raw.trim()
    if (!s) throw new Error('empty answer')
    if (s.startsWith('0x') || s.startsWith('0X')) return BigInt(s)
    if (!/^-?\d+$/.test(s)) throw new Error('answer must be integer decimal or 0x hex')
    return BigInt(s)
  }
  throw new Error('answer must be string | number')
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    endpoint: 'POST /api/update-round',
    oracle: ORACLE,
    rpc: RPC,
    chainId: 45057,
    body: {
      answer: 'string | number — int256 reserve (EUR × 1e18 recommended as string)',
      timestamp: 'optional unix seconds (default: now)',
    },
    example: {
      answer: '1500000000000000000000000000000000000',
    },
    note: 'Requires CUSTODIAN_PRIVATE_KEY env. EAC_AGGREGATOR_ADDRESS defaults to 0xccc…',
  })
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    if (body.answer === undefined || body.answer === null || body.answer === '') {
      return NextResponse.json(
        { error: 'Missing answer', code: 'BAD_ANSWER', example: { answer: '1000000000000000000000000' } },
        { status: 400 }
      )
    }

    let answer: bigint
    try {
      answer = parseAnswer(body.answer)
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : 'Invalid answer', code: 'BAD_ANSWER' },
        { status: 400 }
      )
    }

    const timestamp =
      body.timestamp !== undefined && body.timestamp !== null && body.timestamp !== ''
        ? Number(body.timestamp)
        : Math.floor(Date.now() / 1000)
    if (!Number.isFinite(timestamp) || timestamp <= 0) {
      return NextResponse.json({ error: 'Invalid timestamp', code: 'BAD_TIMESTAMP' }, { status: 400 })
    }

    const pk = (process.env.CUSTODIAN_PRIVATE_KEY || '').trim()
    if (!pk || !pk.startsWith('0x') || pk.length !== 66) {
      return NextResponse.json(
        {
          error: 'Invalid or missing CUSTODIAN_PRIVATE_KEY in environment variables',
          code: 'NO_KEY',
          oracle: ORACLE,
          rpc: RPC,
        },
        { status: 500 }
      )
    }

    const account = privateKeyToAccount(pk as Hex)
    const data = encodeFunctionData({
      abi: AGGREGATOR_ABI,
      functionName: 'updateRoundData',
      args: [answer, BigInt(timestamp)],
    })

    const gasPrice = BigInt(
      (await rpc<string>('eth_gasPrice').catch(() => '0x3b9aca00')) || '0x3b9aca00'
    )
    const nonce = BigInt(
      (await rpc<string>('eth_getTransactionCount', [account.address, 'pending'])) || '0x0'
    )
    const gas = 500000n

    const walletClient = createWalletClient({
      account,
      chain: SLURA as any,
      transport: http(RPC),
    })

    let txHash: Hex
    try {
      txHash = await walletClient.sendTransaction({
        account,
        chain: SLURA as any,
        to: ORACLE,
        data,
        gas,
        gasPrice,
        nonce: Number(nonce),
        value: 0n,
      })
    } catch (e1) {
      try {
        const signed = await walletClient.signTransaction({
          account,
          chain: SLURA as any,
          to: ORACLE,
          data,
          gas,
          gasPrice,
          nonce: Number(nonce),
          value: 0n,
          type: 'legacy',
        } as any)
        txHash = (await rpc<string>('eth_sendRawTransaction', [signed])) as Hex
      } catch (e2) {
        return NextResponse.json(
          {
            error: 'updateRoundData TX rejected by Slura RPC',
            code: 'TX_FAILED',
            detail: String(e2 instanceof Error ? e2.message : e2),
            detailPrimary: String(e1 instanceof Error ? e1.message : e1),
            oracle: ORACLE,
            signer: account.address,
            answer: answer.toString(),
            timestamp,
          },
          { status: 502 }
        )
      }
    }

    return NextResponse.json({
      ok: true,
      status: 'round_updated',
      txHash,
      answer: answer.toString(),
      answerHex: '0x' + answer.toString(16),
      timestamp,
      oracle: ORACLE,
      signer: account.address,
      rpc: RPC,
      chainId: 45057,
      message: 'Oracle round data updated on Slura (updateRoundData)',
    })
  } catch (error) {
    console.error('Update round error:', error)
    return NextResponse.json(
      {
        error: 'Update failed',
        code: 'INTERNAL',
        detail: String(error instanceof Error ? error.message : error),
      },
      { status: 500 }
    )
  }
}
