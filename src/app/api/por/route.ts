import { NextResponse } from 'next/server'

/**
 * GET /api/por
 * Agrège le Proof of Reserves VEZ sur Slura (Charène / 45057).
 *
 * Contournements nœud Slura :
 * - eth_call est souvent cassé (retourne du bytecode au lieu de l'ABI)
 * - eth_getBalance fonctionne → on l'utilise pour la supply / soldes
 * - Oracle 0xccc… peut être absent → fallback lecture sur 0xeeee si code présent
 */

const RPC = process.env.SLURA_RPC_URL || process.env.NEXT_PUBLIC_SLURA_RPC_URL || 'https://slu-charene.vyft-one.com'
const VEZ = (process.env.VEZ_PROXY_ADDRESS || process.env.NEXT_PUBLIC_VEZ_PROXY_ADDRESS || '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee').toLowerCase()
const AGG = (process.env.EAC_AGGREGATOR_ADDRESS || process.env.NEXT_PUBLIC_AGGREGATOR_ADDRESS || '0xcccccccccccccccccccccccccccccccccccccccc').toLowerCase()
/** Premier custodian / owner mint initial (vezcurproxy + engine_platform) */
const CUSTODIAN = (process.env.CUSTODIAN_ADDRESS || '0x53ae54b11251d5003e9aa51422405bc35a2ef32d').toLowerCase()

async function rpc<T = unknown>(method: string, params: unknown[]): Promise<T> {
  const res = await fetch(RPC, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', method, params, id: 1 }),
    cache: 'no-store',
  })
  if (!res.ok) throw new Error(`RPC HTTP ${res.status}`)
  const json = await res.json()
  if (json.error) throw new Error(json.error.message || JSON.stringify(json.error))
  return json.result as T
}

/** Résultat eth_call valide = hex court (ABI-encodé), pas un dump de bytecode */
function isValidCallResult(hex: string | null | undefined, expectedWords = 1): boolean {
  if (!hex || hex === '0x' || hex === '0x0') return false
  const body = hex.startsWith('0x') ? hex.slice(2) : hex
  // 1 mot = 64 hex chars ; tolère jusqu'à 8 mots (round data)
  if (body.length < 64 || body.length > 64 * 8) return false
  // Bytecode runtime commence souvent par 60806040 / 575f5ffd…
  if (body.startsWith('60806040') || body.startsWith('575f5ffd')) return false
  return true
}

function hexToBigInt(hex: string): bigint {
  if (!hex || hex === '0x') return 0n
  return BigInt(hex)
}

function formatVez(wei: bigint): string {
  const whole = wei / 10n ** 18n
  const frac = wei % 10n ** 18n
  if (frac === 0n) return whole.toString()
  const f = frac.toString().padStart(18, '0').replace(/0+$/, '')
  return `${whole}.${f}`
}

export async function GET() {
  const warnings: string[] = []
  const sources: string[] = []

  try {
    const chainIdHex = await rpc<string>('eth_chainId', [])
    const chainId = Number.parseInt(chainIdHex, 16)

    // --- Supply : eth_getBalance (fiable sur Slura) + tentative totalSupply ---
    let totalSupply = 0n
    let supplySource = 'none'

    // 1) Somme des soldes natifs des comptes connus (custodian + proxy + comptes RPC)
    const holders = new Set<string>([CUSTODIAN, VEZ])
    try {
      const accounts = await rpc<string[]>('eth_accounts', [])
      for (const a of accounts || []) holders.add(a.toLowerCase())
    } catch {
      /* ignore */
    }

    let sumBalances = 0n
    const balances: Record<string, string> = {}
    for (const addr of holders) {
      try {
        const balHex = await rpc<string>('eth_getBalance', [addr, 'latest'])
        const bal = hexToBigInt(balHex)
        balances[addr] = formatVez(bal)
        sumBalances += bal
      } catch {
        balances[addr] = '0'
      }
    }

    if (sumBalances > 0n) {
      totalSupply = sumBalances
      supplySource = 'eth_getBalance(sum)'
      sources.push('native balances')
    }

    // 2) Tentative totalSupply() si eth_call renvoie un uint256 valide
    try {
      const ts = await rpc<string>('eth_call', [{ to: VEZ, data: '0x18160ddd' }, 'latest'])
      if (isValidCallResult(ts, 1)) {
        const v = hexToBigInt(ts)
        if (v > 0n) {
          totalSupply = v
          supplySource = 'totalSupply()'
          sources.push('totalSupply eth_call')
        }
      } else {
        warnings.push('eth_call totalSupply() invalide (nœud Slura renvoie du bytecode ou vide)')
      }
    } catch (e) {
      warnings.push(`totalSupply() échoué: ${e instanceof Error ? e.message : String(e)}`)
    }

    // --- Oracle / PoR ---
    let roundId = 0n
    let answer = 0n
    let updatedAt = 0n
    let oracleAddress = AGG
    let oracleDeployed = false

    const codeAgg = await rpc<string>('eth_getCode', [AGG, 'latest'])
    const codeVez = await rpc<string>('eth_getCode', [VEZ, 'latest'])
    oracleDeployed = !!(codeAgg && codeAgg !== '0x' && codeAgg.length > 4)

    // Selectors: latestRoundData 0xfeaf968c, getFullRoundData 0x4cf0d314
    const tryOracle = async (addr: string) => {
      for (const data of ['0xfeaf968c', '0x4cf0d314'] as const) {
        try {
          const raw = await rpc<string>('eth_call', [{ to: addr, data }, 'latest'])
          if (!isValidCallResult(raw, 5)) continue
          // ABI: uint80, int256, uint256, uint256, uint80 → 5 × 32 bytes
          const body = raw.slice(2)
          if (body.length < 320) continue
          const words = body.match(/.{64}/g) || []
          return {
            roundId: BigInt('0x' + words[0]),
            answer: BigInt('0x' + words[1]), // int256 as unsigned for display (price > 0)
            updatedAt: BigInt('0x' + words[3]),
            address: addr,
          }
        } catch {
          /* next */
        }
      }
      return null
    }

    let oracle = oracleDeployed ? await tryOracle(AGG) : null
    if (!oracle && codeVez && codeVez !== '0x') {
      // Parfois le bytecode oracle est confondu avec 0xeeee sur le nœud
      oracle = await tryOracle(VEZ)
      if (oracle) {
        oracleAddress = VEZ
        warnings.push('Oracle lu depuis VEZ_PROXY_ADDRESS (EAC non déployé en 0xccc…)')
      }
    }

    if (oracle) {
      roundId = oracle.roundId
      answer = oracle.answer
      updatedAt = oracle.updatedAt
      oracleAddress = oracle.address
      sources.push('oracle latestRoundData')
    } else {
      warnings.push(
        oracleDeployed
          ? 'Oracle déployé mais eth_call latestRoundData/getFullRoundData invalide'
          : `Oracle non déployé à ${AGG} (eth_getCode vide)`,
      )
    }

    // PoR ratio (niveau USD1) :
    //  - supply=0 + réserve>0 → 100% backed, prêt à émettre (pas "Partial")
    //  - supply>0 → reserve/supply * 100
    const supply = totalSupply
    const reserve = answer > 0n ? answer : 0n
    let ratio = 0
    let status: string
    if (supply === 0n && reserve > 0n) {
      ratio = 100
      status = 'Fully Backed'
    } else if (supply === 0n && reserve === 0n) {
      ratio = 0
      status = 'No Reserve / Idle'
    } else if (supply > 0n && reserve > 0n) {
      ratio = Number((reserve * 10000n) / supply) / 100
      status = ratio >= 99.5 ? 'Fully Backed' : ratio > 0 ? 'Partial' : 'Under Backed'
    } else {
      // supply > 0, reserve = 0
      ratio = 0
      status = 'Under Backed / No Oracle'
    }

    const isBacked = ratio >= 99.5

    return NextResponse.json({
      ok: true,
      chainId,
      rpc: RPC,
      vezProxy: VEZ,
      aggregator: oracleAddress || AGG,
      oracleDeployed: oracleDeployed || !!oracle,
      custodian: CUSTODIAN, // never 0x0
      totalSupply: formatVez(supply),
      totalSupplyWei: supply.toString(),
      supplySource,
      balances,
      reserveAnswer: formatVez(reserve),
      reserveAnswerWei: reserve.toString(),
      reserveRatio: ratio.toFixed(2),
      isBacked,
      status,
      roundId: roundId.toString(),
      updatedAt: updatedAt > 0n ? new Date(Number(updatedAt) * 1000).toISOString() : null,
      sources,
      warnings,
      fetchedAt: new Date().toISOString(),
    })
  } catch (e) {
    return NextResponse.json(
      {
        ok: false,
        error: e instanceof Error ? e.message : String(e),
        rpc: RPC,
      },
      { status: 502 },
    )
  }
}
