/**
 * VEZ Proof-of-Reserves collateralization policy.
 * Target: 101% — reserves (EUR, 1e18 wei) must cover at least 1.01 × circulating VEZ.
 */
export const COLLATERAL_RATIO_PCT = 101
export const COLLATERAL_RATIO_BPS = 10100n // 101.00%

/** Max VEZ supply (1e18 wei) allowed for a given EUR reserve at 101% coverage */
export function maxSupplyAtCollateral(reserveWei: bigint): bigint {
  if (reserveWei <= 0n) return 0n
  // supply <= reserve * 100 / 101
  return (reserveWei * 100n) / COLLATERAL_RATIO_PCT
}

/** Headroom to mint while keeping ratio ≥ 101% after mint */
export function availableToMint101(reserveWei: bigint, supplyWei: bigint): bigint {
  const maxSupply = maxSupplyAtCollateral(reserveWei)
  return maxSupply > supplyWei ? maxSupply - supplyWei : 0n
}

/** reserve/supply × 100 (two decimal places via bps intermediate) */
export function collateralRatioPct(reserveWei: bigint, supplyWei: bigint): number {
  if (supplyWei === 0n) return reserveWei > 0n ? 100 : 0
  return Number((reserveWei * 10000n) / supplyWei) / 100
}

export function isFullyBacked(ratioPct: number): boolean {
  return ratioPct >= COLLATERAL_RATIO_PCT
}
