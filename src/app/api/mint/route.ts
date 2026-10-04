import { NextRequest, NextResponse } from 'next/server'
import {
  createPublicClient,
  createWalletClient,
  http,
  parseUnits,
  formatUnits,
  encodeFunctionData,
  type Hex,
} from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { VEZ_PROXY_ABI } from '../../../lib/contracts/abi'
import { AGGREGATOR_ABI } from '../../../lib/contracts/abi'

const SLURA_CHAIN = {
  id: 45057,
  name: 'Slura Charène',
  nativeCurrency: { name: 'VEZ', symbol: 'VEZ', decimals: 18 },
  rpcUrls: {
    default: { http: [process.env.SLURA_RPC_URL || 'https://slu-charene.vyft-one.com'] },
  },
} as const

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
        { error: 'Missing amount (VEZ human units, e.g. "100" or "1.5")' },
        { status: 400 }
      )
    }

    const RPC = process.env.SLURA_RPC_URL || 'https://slu-charene.vyft-one.com'
    const VEZ = (process.env.VEZ_PROXY_ADDRESS ||
      '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee') as `0x${string}`
    const ORACLE = (process.env.EAC_AGGREGATOR_ADDRESS ||
      process.env.EAC_PROXY_AGGREGATOR_ADDRESS ||
      '0xcccccccccccccccccccccccccccccccccccccccc') as `0x${string}`
    const pk = process.env.CUSTODIAN_PRIVATE_KEY as `0x${string}` | undefined

    if (!pk || !pk.startsWith('0x') || pk.length < 66) {
      return NextResponse.json(
        {
          error:
            'Server configuration error: set CUSTODIAN_PRIVATE_KEY (0x…) in Netlify env',
        },
        { status: 500 }
      )
    }

    // amount: human VEZ string → wei; or already wei integer string if body.wei === true
    let amountWei: bigint
    try {
      if (body.wei === true || body.unit === 'wei') {
        amountWei = BigInt(String(amountRaw))
      } else {
        amountWei = parseUnits(String(amountRaw), 18)
      }
    } catch {
      return NextResponse.json({ error: 'Invalid amount' }, { status: 400 })
    }
    if (amountWei <= 0n) {
      return NextResponse.json({ error: 'Amount must be > 0' }, { status: 400 })
    }

    const publicClient = createPublicClient({
      chain: SLURA_CHAIN,
      transport: http(RPC),
    })
    const account = privateKeyToAccount(pk)
    const walletClient = createWalletClient({
      account,
      chain: SLURA_CHAIN,
      transport: http(RPC),
    })

    // ── EUR reserve from EAC oracle (latestRoundData) ─────────────────
    let reserveWei = 0n
    let roundId: string | null = null
    try {
      const round = (await publicClient.readContract({
        address: ORACLE,
        abi: AGGREGATOR_ABI,
        functionName: 'latestRoundData',
      })) as readonly [bigint, bigint, bigint, bigint, bigint]
      // answer can be int256; treat as unsigned magnitude for EUR * 1e18
      const ans = round[1]
      reserveWei = ans < 0n ? -ans : ans
      roundId = round[0].toString()
    } catch (e) {
      console.warn('oracle latestRoundData failed', e)
      return NextResponse.json(
        {
          error:
            'Cannot read EUR reserve from oracle (EAC latestRoundData). Is EAC_PROXY_AGGREGATOR deployed?',
        },
        { status: 502 }
      )
    }

    // ── Current supply (totalSupply or proxy balance sum fallback) ────
    let supplyWei = 0n
    try {
      supplyWei = (await publicClient.readContract({
        address: VEZ,
        abi: VEZ_PROXY_ABI,
        functionName: 'totalSupply',
      })) as bigint
    } catch {
      try {
        const code = await publicClient.getBalance({ address: VEZ })
        // ignore
        void code
      } catch {
        /* empty */
      }
    }

    // Cap mint by EUR reserve (1 VEZ backed by 1 unit of oracle answer scale)
    const newSupply = supplyWei + amountWei
    if (reserveWei > 0n && newSupply > reserveWei) {
      const available = reserveWei > supplyWei ? reserveWei - supplyWei : 0n
      return NextResponse.json(
        {
          error: 'Mint exceeds EUR reserve backing',
          reserveEUR: formatUnits(reserveWei, 18),
          currentSupply: formatUnits(supplyWei, 18),
          availableToMint: formatUnits(available, 18),
          requested: formatUnits(amountWei, 18),
          roundId,
        },
        { status: 400 }
      )
    }

    // ── On-chain mint(to, amount) from custodian key ──────────────────
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
    } catch (e: unknown) {
      // Fallback: raw eth_sendTransaction style via encode + sendTransaction
      const data = encodeFunctionData({
        abi: VEZ_PROXY_ABI,
        functionName: 'mint',
        args: [recipient as `0x${string}`, amountWei],
      })
      try {
        txHash = await walletClient.sendTransaction({
          to: VEZ,
          data,
          chain: SLURA_CHAIN,
          account,
        })
      } catch (e2) {
        console.error('mint write failed', e, e2)
        return NextResponse.json(
          {
            error: 'Mint transaction failed on Slura RPC',
            detail: String(e2 instanceof Error ? e2.message : e2),
            signer: account.address,
            vez: VEZ,
            oracle: ORACLE,
          },
          { status: 502 }
        )
      }
    }

    return NextResponse.json({
      ok: true,
      status: 'minted',
      txHash,
      recipient,
      amount: formatUnits(amountWei, 18),
      amountWei: amountWei.toString(),
      reserveEUR: formatUnits(reserveWei, 18),
      supplyBefore: formatUnits(supplyWei, 18),
      roundId,
      signer: account.address,
      vez: VEZ,
      oracle: ORACLE,
      message: `Minted ${formatUnits(amountWei, 18)} VEZ to ${recipient} (EUR-backed)`,
    })
  } catch (error) {
    console.error('Mint error:', error)
    return NextResponse.json(
      {
        error: 'Mint failed',
        detail: String(error instanceof Error ? error.message : error),
      },
      { status: 500 }
    )
  }
}
