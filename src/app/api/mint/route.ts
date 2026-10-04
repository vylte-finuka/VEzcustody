import { NextRequest, NextResponse } from 'next/server'
import {
  createPublicClient,
  createWalletClient,
  http,
  parseUnits,
  formatUnits,
  encodeFunctionData,
  type Hex,
  type Chain,
} from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { VEZ_PROXY_ABI, AGGREGATOR_ABI } from '../../../lib/contracts/abi'

const RPC = process.env.SLURA_RPC_URL || 'https://slu-charene.vyft-one.com'
const VEZ = (process.env.VEZ_PROXY_ADDRESS ||
  '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee') as `0x${string}`
const ORACLE = (process.env.EAC_AGGREGATOR_ADDRESS ||
  process.env.EAC_PROXY_AGGREGATOR_ADDRESS ||
  '0xcccccccccccccccccccccccccccccccccccccccc') as `0x${string}`
const CUSTODIAN = (process.env.CUSTODIAN_ADDRESS ||
  '0x53ae54b11251d5003e9aa51422405bc35a2ef32d').toLowerCase()

const SLURA_CHAIN = {
  id: 45057,
  name: 'Slura Charène',
  nativeCurrency: { name: 'VEZ', symbol: 'VEZ', decimals: 18 },
  rpcUrls: { default: { http: [RPC] } },
} as const satisfies Chain

function publicClient() {
  return createPublicClient({ chain: SLURA_CHAIN, transport: http(RPC) })
}

async function readReserveAndSupply() {
  const client = publicClient()
  let reserveWei = 0n
  let roundId: string | null = null
  let updatedAt: string | null = null
  try {
    const round = (await client.readContract({
      address: ORACLE,
      abi: AGGREGATOR_ABI,
      functionName: 'latestRoundData',
    })) as readonly [bigint, bigint, bigint, bigint, bigint]
    const ans = round[1]
    reserveWei = ans < 0n ? -ans : ans
    roundId = round[0].toString()
    updatedAt = new Date(Number(round[3]) * 1000).toISOString()
  } catch (e) {
    throw new Error(
      `Oracle EAC unread: ${e instanceof Error ? e.message : String(e)}`
    )
  }

  let supplyWei = 0n
  try {
    supplyWei = (await client.readContract({
      address: VEZ,
      abi: VEZ_PROXY_ABI,
      functionName: 'totalSupply',
    })) as bigint
  } catch {
    try {
      supplyWei = await client.getBalance({
        address: CUSTODIAN as `0x${string}`,
      })
    } catch {
      supplyWei = 0n
    }
  }

  const available =
    reserveWei > supplyWei ? reserveWei - supplyWei : 0n

  return { reserveWei, supplyWei, available, roundId, updatedAt }
}

/** Health / readiness — production status for issuance terminal */
export async function GET() {
  try {
    const pk = process.env.CUSTODIAN_PRIVATE_KEY
    const keyConfigured = !!(pk && pk.startsWith('0x') && pk.length >= 66)
    let signer: string | null = null
    if (keyConfigured) {
      try {
        signer = privateKeyToAccount(pk as `0x${string}`).address
      } catch {
        signer = null
      }
    }

    const { reserveWei, supplyWei, available, roundId, updatedAt } =
      await readReserveAndSupply()

    const ready =
      keyConfigured &&
      signer !== null &&
      reserveWei > 0n &&
      available > 0n

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
      oracleUpdatedAt: updatedAt,
      requirements: [
        !keyConfigured && 'Set CUSTODIAN_PRIVATE_KEY on Netlify',
        keyConfigured &&
          signer &&
          signer.toLowerCase() !== CUSTODIAN &&
          `Signer ${signer} ≠ custodian ${CUSTODIAN}`,
        reserveWei === 0n && 'Oracle reserve is 0 — update EAC round',
        available === 0n &&
          reserveWei > 0n &&
          'No headroom: supply already equals/exceeds EUR reserve',
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

    if (!recipient || !/^0x[a-fA-F0-9]{40}$/.test(recipient)) {
      return NextResponse.json(
        { error: 'Missing or invalid recipient (0x… address)' },
        { status: 400 }
      )
    }
    if (amountRaw === undefined || amountRaw === null || amountRaw === '') {
      return NextResponse.json(
        { error: 'Missing amount (VEZ human units, e.g. "1" or "0.5")' },
        { status: 400 }
      )
    }

    const pk = process.env.CUSTODIAN_PRIVATE_KEY as `0x${string}` | undefined
    if (!pk || !pk.startsWith('0x') || pk.length < 66) {
      return NextResponse.json(
        {
          error:
            'Issuance terminal not configured: set CUSTODIAN_PRIVATE_KEY (0x…) in Netlify env and redeploy',
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
      return NextResponse.json({ error: 'Invalid amount' }, { status: 400 })
    }
    if (amountWei <= 0n) {
      return NextResponse.json({ error: 'Amount must be > 0' }, { status: 400 })
    }

    const { reserveWei, supplyWei, available, roundId } =
      await readReserveAndSupply()

    if (amountWei > available) {
      return NextResponse.json(
        {
          error: 'Mint exceeds EUR reserve backing (1:1 PoR)',
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

    const walletClient = createWalletClient({
      account,
      chain: SLURA_CHAIN,
      transport: http(RPC),
    })

    const data = encodeFunctionData({
      abi: VEZ_PROXY_ABI,
      functionName: 'mint',
      args: [recipient as `0x${string}`, amountWei],
    })

    let txHash: Hex
    try {
      txHash = await walletClient.writeContract({
        address: VEZ,
        abi: VEZ_PROXY_ABI,
        functionName: 'mint',
        args: [recipient as `0x${string}`, amountWei],
        chain: SLURA_CHAIN,
        account,
      })
    } catch (e1) {
      try {
        txHash = await walletClient.sendTransaction({
          to: VEZ,
          data,
          chain: SLURA_CHAIN,
          account,
        })
      } catch (e2) {
        return NextResponse.json(
          {
            error: 'Mint transaction rejected by Slura RPC',
            code: 'TX_FAILED',
            detail: String(e2 instanceof Error ? e2.message : e2),
            detailWrite: String(e1 instanceof Error ? e1.message : e1),
            signer: account.address,
            vez: VEZ,
            oracle: ORACLE,
            calldata: data,
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
      message: `Minted ${formatUnits(amountWei, 18)} VEZ → ${recipient} (EUR-backed 1:1)`,
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
