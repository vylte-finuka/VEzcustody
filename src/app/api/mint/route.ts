import { NextRequest, NextResponse } from 'next/server'
import {
  http,
  createWalletClient,
  createPublicClient,
  parseUnits,
  formatUnits,
  encodeFunctionData,
  type Hex,
  type Address,
  type PublicClient,
  type WalletClient,
} from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { VEZ_PROXY_ABI } from '../../../lib/contracts/abi'

const RPC = process.env.SLURA_RPC_URL || 'https://slu-charene.vyft-one.com'
const VEZ = (process.env.VEZ_PROXY_ADDRESS ||
  '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee') as Address
const ORACLE = (process.env.EAC_AGGREGATOR_ADDRESS ||
  '0xcccccccccccccccccccccccccccccccccccccccc') as Address
const CUSTODIAN = (
  process.env.CUSTODIAN_ADDRESS ||
  '0x53ae54b11251d5003e9aa51422405bc35a2ef32d'
).toLowerCase()

/** Minimal chain definition — no `satisfies Chain` (avoids Netlify TS break) */
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

function hexToBigInt(hex: string | undefined | null): bigint {
  if (!hex || hex === '0x' || hex === '0x0') return 0n
  return BigInt(hex)
}

/** latestRoundData() → answer (EUR * 1e18) */
async function readOracleReserve(): Promise<{
  reserveWei: bigint
  roundId: string
  updatedAt: number
}> {
  // selector 0xfeaf968c
  const data = await rpc<string>('eth_call', [
    { to: ORACLE, data: '0xfeaf968c' },
    'latest',
  ])
  if (!data || data === '0x' || data.length < 2 + 64 * 5) {
    throw new Error('Oracle latestRoundData empty/invalid')
  }
  const h = data.slice(2)
  const word = (i: number) => BigInt('0x' + h.slice(i * 64, i * 64 + 64))
  const roundId = word(0)
  let answer = word(1)
  // int256 negative → two's complement (unlikely for EUR reserve)
  if (answer > 2n ** 255n) {
    answer = answer - 2n ** 256n
  }
  const reserveWei = answer < 0n ? -answer : answer
  const updatedAt = Number(word(3))
  return { reserveWei, roundId: roundId.toString(), updatedAt }
}

async function readSupply(): Promise<bigint> {
  try {
    const data = await rpc<string>('eth_call', [
      { to: VEZ, data: '0x18160ddd' },
      'latest',
    ])
    return hexToBigInt(data)
  } catch {
    return hexToBigInt(
      await rpc<string>('eth_getBalance', [CUSTODIAN, 'latest'])
    )
  }
}

export async function GET() {
  try {
    const pk = process.env.CUSTODIAN_PRIVATE_KEY
    const keyConfigured = !!(pk && pk.startsWith('0x') && pk.length >= 66)
    let signer: string | null = null
    if (keyConfigured) {
      try {
        signer = privateKeyToAccount(pk as Hex).address
      } catch {
        signer = null
      }
    }

    let reserveWei = 0n
    let supplyWei = 0n
    let roundId: string | null = null
    let oracleOk = false
    try {
      const o = await readOracleReserve()
      reserveWei = o.reserveWei
      roundId = o.roundId
      oracleOk = true
    } catch (e) {
      return NextResponse.json({
        ok: false,
        ready: false,
        issuance: 'oracle_down',
        error: e instanceof Error ? e.message : String(e),
        keyConfigured,
        rpc: RPC,
        vez: VEZ,
        oracle: ORACLE,
      })
    }
    try {
      supplyWei = await readSupply()
    } catch {
      supplyWei = 0n
    }

    const available = reserveWei > supplyWei ? reserveWei - supplyWei : 0n
    const ready =
      keyConfigured && !!signer && oracleOk && available > 0n

    return NextResponse.json({
      ok: true,
      ready,
      issuance: ready ? 'operational' : 'not_ready',
      chainId: 45057,
      rpc: RPC,
      vez: VEZ,
      oracle: ORACLE,
      custodian: CUSTODIAN,
      signer,
      signerMatchesCustodian: signer
        ? signer.toLowerCase() === CUSTODIAN
        : false,
      keyConfigured,
      reserveEUR: formatUnits(reserveWei, 18),
      totalSupply: formatUnits(supplyWei, 18),
      availableToMint: formatUnits(available, 18),
      roundId,
      requirements: [
        !keyConfigured && 'Set CUSTODIAN_PRIVATE_KEY on Netlify + redeploy',
        keyConfigured &&
          signer &&
          signer.toLowerCase() !== CUSTODIAN &&
          `Signer ${signer} ≠ custodian ${CUSTODIAN}`,
        available === 0n && 'No mint headroom vs EUR reserve',
      ].filter(Boolean),
    })
  } catch (e) {
    return NextResponse.json(
      {
        ok: false,
        ready: false,
        issuance: 'error',
        error: e instanceof Error ? e.message : String(e),
      },
      { status: 502 }
    )
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const recipient = (body.recipient || body.to || '').toString().trim()
    const amountRaw = body.amount ?? body.value

    if (!recipient || !/^0x[a-fA-F0-9]{40}$/i.test(recipient)) {
      return NextResponse.json(
        { error: 'Missing or invalid recipient', code: 'BAD_RECIPIENT' },
        { status: 400 }
      )
    }
    if (amountRaw === undefined || amountRaw === null || amountRaw === '') {
      return NextResponse.json(
        { error: 'Missing amount', code: 'BAD_AMOUNT' },
        { status: 400 }
      )
    }

    const pk = process.env.CUSTODIAN_PRIVATE_KEY as Hex | undefined
    if (!pk || !pk.startsWith('0x') || pk.length < 66) {
      return NextResponse.json(
        {
          error:
            'Issuance not configured: set CUSTODIAN_PRIVATE_KEY in Netlify env, then redeploy',
          code: 'NO_CUSTODIAN_KEY',
        },
        { status: 503 }
      )
    }

    let amountWei: bigint
    try {
      amountWei =
        body.wei === true || body.unit === 'wei'
          ? BigInt(String(amountRaw))
          : parseUnits(String(amountRaw), 18)
    } catch {
      return NextResponse.json(
        { error: 'Invalid amount', code: 'BAD_AMOUNT' },
        { status: 400 }
      )
    }
    if (amountWei <= 0n) {
      return NextResponse.json(
        { error: 'Amount must be > 0', code: 'BAD_AMOUNT' },
        { status: 400 }
      )
    }

    const { reserveWei, roundId } = await readOracleReserve()
    const supplyWei = await readSupply()
    const available = reserveWei > supplyWei ? reserveWei - supplyWei : 0n

    if (amountWei > available) {
      return NextResponse.json(
        {
          error: 'Mint exceeds EUR reserve (1:1 PoR)',
          code: 'INSUFFICIENT_RESERVE',
          reserveEUR: formatUnits(reserveWei, 18),
          currentSupply: formatUnits(supplyWei, 18),
          availableToMint: formatUnits(available, 18),
          requested: formatUnits(amountWei, 18),
          roundId,
        },
        { status: 400 }
      )
    }

    let account
    try {
      account = privateKeyToAccount(pk)
    } catch {
      return NextResponse.json(
        { error: 'Invalid CUSTODIAN_PRIVATE_KEY', code: 'BAD_KEY' },
        { status: 500 }
      )
    }

    const data = encodeFunctionData({
      abi: VEZ_PROXY_ABI,
      functionName: 'mint',
      args: [recipient as Address, amountWei],
    })

    // Fixed gas — skip eth_estimateGas (often broken on custom VMs)
    const gas = 500_000n
    const gasPrice = hexToBigInt(
      await rpc<string>('eth_gasPrice').catch(() => '0x3b9aca00')
    )
    const nonce = hexToBigInt(
      await rpc<string>('eth_getTransactionCount', [
        account.address,
        'pending',
      ])
    )

    const walletClient = createWalletClient({
      account,
      chain: SLURA as any,
      transport: http(RPC),
    })

    let txHash: Hex
    try {
      // Prefer sendTransaction with explicit gas (no estimate)
      txHash = await walletClient.sendTransaction({
        account,
        chain: SLURA as any,
        to: VEZ,
        data,
        gas,
        gasPrice,
        nonce: Number(nonce),
        value: 0n,
      })
    } catch (e1) {
      try {
        // Fallback: sign + eth_sendRawTransaction
        const signed = await walletClient.signTransaction({
          account,
          chain: SLURA as any,
          to: VEZ,
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
            error: 'Mint TX rejected by Slura RPC',
            code: 'TX_FAILED',
            detail: String(e2 instanceof Error ? e2.message : e2),
            detailPrimary: String(e1 instanceof Error ? e1.message : e1),
            signer: account.address,
            nonce: nonce.toString(),
            gas: gas.toString(),
            gasPrice: gasPrice.toString(),
            calldata: data,
            vez: VEZ,
          },
          { status: 502 }
        )
      }
    }

    return NextResponse.json({
      ok: true,
      status: 'minted',
      txHash,
      recipient: recipient.toLowerCase(),
      amount: formatUnits(amountWei, 18),
      amountWei: amountWei.toString(),
      reserveEUR: formatUnits(reserveWei, 18),
      supplyBefore: formatUnits(supplyWei, 18),
      supplyAfter: formatUnits(supplyWei + amountWei, 18),
      availableAfter: formatUnits(available - amountWei, 18),
      roundId,
      signer: account.address,
      vez: VEZ,
      oracle: ORACLE,
      message: `Minted ${formatUnits(amountWei, 18)} VEZ → ${recipient} (EUR 1:1)`,
    })
  } catch (error) {
    console.error('Mint error:', error)
    return NextResponse.json(
      {
        error: 'Mint failed',
        code: 'INTERNAL',
        detail: String(error instanceof Error ? error.message : error),
      },
      { status: 500 }
    )
  }
}
