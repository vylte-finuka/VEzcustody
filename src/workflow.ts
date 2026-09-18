/**
 * VEZ Stablecoin CRE Workflow
 * 
 * This workflow simulates the VEZ stablecoin orchestration on Slura chain (chainId 45057).
 * It handles minting, transfers, and disbursements via the VEZproxy contract.
 * 
 * @chainlink/cre-sdk v1.3.0+
 */

import {
  EVMClient,
  getNetwork,
  hexToBase64,
  bytesToHex,
  TxStatus,
  type Runtime,
  type EvmTx,
} from "@chainlink/cre-sdk"
import { encodeAbiParameters } from "viem"
import { formatUnits, parseUnits } from "viem"

// ============================================================
// Configuration
// ============================================================

// Slura chain configuration (chainId 45057)
const CHAIN_ID = "45057"
const RPC_URL = "https://slu-charene.vyft-one.com"

// Contract addresses on Slura
const VEZ_PROXY_ADDRESS = "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"
const RESERVE_PROOF_ADDRESS = "0x5555555555555555555555555555555555555555"
const AGGREGATOR_ADDRESS = "0x5555555555555555555555555555555555555555"

// Custodian private key (from secrets.yaml/CRE_CUSTODIAN_PRIVATE_KEY)
// This key signs all on-chain operations
const CUSTODIAN_PRIVATE_KEY = process.env.CRE_CUSTODIAN_PRIVATE_KEY || ""

// ============================================================
// EVM Client Setup
// ============================================================

const network = getNetwork(CHAIN_ID)
const evm = new EVMClient(network, RPC_URL)

// ============================================================
// Capabilities
// ============================================================

/**
 * Sign and send an EVM transaction
 * @param to Recipient address
 * @param data Encoded calldata
 * @param value ETH value (in wei)
 * @returns Transaction hash
 */
async function signEvmTx(
  to: string,
  data: string,
  value: bigint = 0n
): Promise<string> {
  if (!CUSTODIAN_PRIVATE_KEY) {
    throw new Error("CUSTODIAN_PRIVATE_KEY not configured")
  }

  const tx: EvmTx = {
    to,
    data,
    value,
  }

  const signedTx = await evm.signEvmTransaction(tx, CUSTODIAN_PRIVATE_KEY)
  const hash = await evm.sendEvmTransaction(signedTx)

  return hash
}

/**
 * Mint VEZ tokens via the proxy contract
 * @param to Recipient address
 * @param amount Amount in VEZ (18 decimals)
 * @returns Transaction hash
 */
async function mintVez(to: string, amount: bigint): Promise<string> {
  // Encode mint calldata: mint(address to, uint256 amount)
  const mintData = evm.encodeEvmCall({
    abi: [
      {
        name: "mint",
        type: "function",
        inputs: [
          { name: "to", type: "address" },
          { name: "amount", type: "uint256" },
        ],
        stateMutability: "nonpayable",
        outputs: [],
      },
    ],
    address: VEZ_PROXY_ADDRESS,
    args: [to, amount],
  })

  return signEvmTx(VEZ_PROXY_ADDRESS, mintData)
}

/**
 * Transfer VEZ tokens (with burn if configured)
 * @param from Sender address
 * @param to Recipient address
 * @param amount Amount in VEZ (18 decimals)
 * @returns Transaction hash
 */
async function transferVez(
  from: string,
  to: string,
  amount: bigint
): Promise<string> {
  const transferData = evm.encodeEvmCall({
    abi: [
      {
        name: "transfer",
        type: "function",
        inputs: [
          { name: "to", type: "address" },
          { name: "amount", type: "uint256" },
        ],
        stateMutability: "nonpayable",
        outputs: [],
      },
    ],
    address: VEZ_PROXY_ADDRESS,
    args: [to, amount],
  })

  return signEvmTx(from, transferData)
}

/**
 * Obtain (burn) VEZ tokens for fiat redemption
 * @param amount Amount in VEZ (18 decimals) to burn
 * @param proof Redemption proof (off-chain KYC/AML data)
 * @returns Transaction hash
 */
async function obtainVez(amount: bigint, proof: string): Promise<string> {
  const obtainData = evm.encodeEvmCall({
    abi: [
      {
        name: "obtain",
        type: "function",
        inputs: [
          { name: "amount", type: "uint256" },
          { name: "proof", type: "string" },
        ],
        stateMutability: "nonpayable",
        outputs: [],
      },
    ],
    address: VEZ_PROXY_ADDRESS,
    args: [amount, proof],
  })

  return signEvmTx(CUSTODIAN_PRIVATE_KEY || "", obtainData)
}

/**
 * Check reserve status via aggregator proxy
 * @returns Reserve status data
 */
async function checkReserves() {
  const reserveData = evm.encodeEvmCall({
    abi: [
      {
        name: "latestRoundData",
        type: "function",
        inputs: [],
        stateMutability: "view",
        outputs: [
          { name: "roundId", type: "uint80" },
          { name: "answer", type: "int256" },
          { name: "startedAt", type: "uint256" },
          { name: "updatedAt", type: "uint256" },
          { name: "answeredInRound", type: "uint80" },
        ],
      },
    ],
    address: AGGREGATOR_ADDRESS,
    args: [],
  })

  const result = await evm.callEvmContract({
    to: AGGREGATOR_ADDRESS,
    data: reserveData,
  })

  return {
    roundId: result.roundId.toString(),
    answer: result.answer.toString(),
    startedAt: result.startedAt.toString(),
    updatedAt: result.updatedAt.toString(),
    answeredInRound: result.answeredInRound.toString(),
  }
}

// ============================================================
// Main Workflow Entry Point
// ============================================================

/**
 * Main handler - called by CRE CLI during simulation
 * This is the entry point that CRE invokes
 */
export const handler = async (runtime: Runtime) => {
  // Get input parameters from the workflow trigger
  const { action, params } = runtime.getInput()

  console.log(`VEZ Workflow executing: action=${action}`)

  try {
    switch (action) {
      case "check-reserves": {
        const reserves = await checkReserves()
        console.log("Reserve status:", reserves)
        runtime.log(`Reserves checked: ${JSON.stringify(reserves)}`)
        return { success: true, data: reserves }
      }

      case "mint": {
        const { to, amount } = params
        if (!to || !amount) {
          throw new Error("Missing mint parameters: to and amount required")
        }

        const amountWei = parseUnits(amount.toString(), 18)
        const txHash = await mintVez(to, amountWei)
        console.log(`Minted ${amountWei} VEZ to ${to}, tx: ${txHash}`)

        runtime.log(`Mint completed: ${txHash}`)
        return { success: true, txHash, amount: amountWei.toString() }
      }

      case "transfer": {
        const { from, to, amount } = params
        if (!from || !to || !amount) {
          throw new Error("Missing transfer parameters: from, to and amount required")
        }

        const amountWei = parseUnits(amount.toString(), 18)
        const txHash = await transferVez(from, to, amountWei)
        console.log(`Transferred ${amountWei} VEZ from ${from} to ${to}, tx: ${txHash}`)

        runtime.log(`Transfer completed: ${txHash}`)
        return { success: true, txHash, amount: amountWei.toString() }
      }

      case "obtain": {
        const { amount, proof } = params
        if (!amount || !proof) {
          throw new Error("Missing obtain parameters: amount and proof required")
        }

        const amountWei = parseUnits(amount.toString(), 18)
        const txHash = await obtainVez(amountWei, proof)
        console.log(`Obtained (burned) ${amountWei} VEZ, tx: ${txHash}`)

        runtime.log(`Obtain completed: ${txHash}`)
        return { success: true, txHash, amount: amountWei.toString() }
      }

      case "get-status": {
        // Check user status via custodian
        const status = await runtime.callEvmContract({
          to: VEZ_PROXY_ADDRESS,
          data: evm.encodeEvmCall({
            abi: [
              {
                name: "balanceOf",
                type: "function",
                inputs: [{ name: "account", type: "address" }],
                stateMutability: "view",
                outputs: [{ name: "", type: "uint256" }],
              },
            ],
            address: VEZ_PROXY_ADDRESS,
            args: [runtime.getCaller()],
          }),
        })

        return {
          success: true,
          balance: status.balance.toString(),
          caller: runtime.getCaller(),
        }
      }

      default:
        throw new Error(`Unknown action: ${action}`)
    }
  } catch (error) {
    console.error("VEZ workflow error:", error)
    runtime.log(`Error: ${error instanceof Error ? error.message : String(error)}`)
    throw error
  }
}

// Export types for CRE SDK
export type { Runtime }