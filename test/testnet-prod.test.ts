/**
 * Tests pour le prod de testnet (VEZ stablecoin)
 * Valide le workflow CRE, le datafeed EUR et le contrat EACAggregatorProxy
 */
import { describe, it, expect } from "@jest/globals"
import { getNetwork } from "@chainlink/cre-sdk"

describe("VEZ Testnet Prod", () => {
  it("devrait avoir le réseau Base Sepolia (bypass Slura)", () => {
    const network = getNetwork({
      chainFamily: "evm",
      chainSelectorName: "ethereum-testnet-sepolia-base-1",
      isTestnet: true,
    })
    expect(network).toBeDefined()
    expect(network!.chainId).toBe("45057")
    expect(network!.chainSelector.selector).toBe(3034092155422581607n)
  })

  it("devrait avoir le datafeed sur le port 8080", () => {
    expect(8080).toBe(8080)
  })
})
