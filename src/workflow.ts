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
  prepareReportRequest,
  encodeCallMsg,
  type Runtime,
  LAST_FINALIZED_BLOCK_NUMBER,
  TxStatus,
} from "@chainlink/cre-sdk"
import { encodeFunctionData, type Address } from "viem"
import { z } from "zod"

const ConfigSchema = z.object({
  chainSelectorName: z.string(),
  receiverAddress: z.string(),
  contractAddress: z.string(),
})

type Config = z.infer<typeof ConfigSchema>

// Contract addresses from project.yaml / cre.toml
const VEZ_PROXY_ADDRESS = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE" as Address
const AGGREGATOR_ADDRESS = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE" as Address

const VEZ_PROXY_ABI = [
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
  {
    name: "balanceOf",
    type: "function",
    inputs: [{ name: "account", type: "address" }],
    stateMutability: "view",
    outputs: [{ name: "", type: "uint256" }],
  },
] as const

const AGGREGATOR_ABI = [
  {
    name: "getFullRoundData",
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
  {
    name: "updateRoundData",
    type: "function",
    inputs: [
      { name: "_answer", type: "int256" },
      { name: "_timestamp", type: "uint256" },
    ],
    stateMutability: "nonpayable",
    outputs: [],
  },
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
] as const

const network = getNetwork({
  chainFamily: "evm",
  chainSelectorName: "slura",
  isTestnet: true,
})

if (!network) throw new Error(`Network not found: slura`)

const evm = new EVMClient(network.chainSelector.selector)

// Main handler - called by CRE CLI during simulation
export const handler = async (runtime: Runtime<Config>, triggerOutput?: unknown) => {
  // Parse trigger output (input parameters)
  const input = triggerOutput ? JSON.parse(JSON.stringify(triggerOutput)) : {}
  const { action, params } = input as { action: string; params?: any }

  console.log(`VEZ Workflow executing: action=${action}`)

  try {
    switch (action) {
      case "check-reserves": {
        const reserveData = encodeFunctionData({
          abi: AGGREGATOR_ABI,
          functionName: "getFullRoundData",
          args: [],
        })

        const call = encodeCallMsg({
          from: VEZ_PROXY_ADDRESS,
          to: AGGREGATOR_ADDRESS,
          data: reserveData as `0x${string}`,
        })

        const reply = evm.callContract(runtime, {
          call,
          blockNumber: LAST_FINALIZED_BLOCK_NUMBER,
        }).result()

        const reserves = {
          roundId: reply.data ? reply.data.toString() : "0",
          answer: reply.data ? reply.data.toString() : "0",
          priceEUR: reply.data ? (parseInt(reply.data.toString()) / 1e8).toFixed(4) : "1.0000",
          pegDeviationBps: reply.data ? Math.round((parseInt(reply.data.toString()) / 1e8 - 1) * 10000) : 0,
        }

        const priceEUR = parseFloat(reserves.priceEUR || "1.0000")
        const deviation = Math.abs(priceEUR - 1.0)
        const action = deviation > 0.003 ? (priceEUR < 1 ? "obtain" : "mint") : "hold"
        console.log(`Peg EUR=${priceEUR}, deviation=${deviation.toFixed(4)}, action=${action}`)
        return { success: true, data: reserves, priceEUR, deviation, action }
      }

      case "update-oracle": {
        const { answer, timestamp } = params as { answer: string; timestamp: string }
        if (!answer || !timestamp) {
          throw new Error("Missing update-oracle parameters: answer and timestamp required")
        }

        const writeData = encodeFunctionData({
          abi: AGGREGATOR_ABI,
          functionName: "updateRoundData",
          args: [BigInt(answer), BigInt(timestamp)],
        })

        const report = runtime.report(prepareReportRequest(writeData)).result()
        const response = evm
          .writeReport(runtime, { receiver: AGGREGATOR_ADDRESS, report })
          .result() as any

        if (response.txStatus !== "SUCCESS") {
          throw new Error(
            response.errorMessage || `Oracle update failed: ${response.txStatus}`
          )
        }

        console.log(`Oracle updated: answer=${answer}, tx: ${response.txHash}`)
        runtime.log(`Oracle update completed: ${response.txHash}`)
        return { success: true, txHash: response.txHash, answer, timestamp }
      }

      case "mint": {
        const { to, amount } = params as { to: string; amount: string }
        if (!to || !amount) {
          throw new Error("Missing mint parameters: to and amount required")
        }

        const amountWei = BigInt(amount)
        const writeData = encodeFunctionData({
          abi: VEZ_PROXY_ABI,
          functionName: "mint",
          args: [to as Address, amountWei],
        })

        const report = runtime.report(prepareReportRequest(writeData)).result()
        const response = evm
          .writeReport(runtime, { receiver: VEZ_PROXY_ADDRESS, report })
          .result() as any

        if (response.txStatus !== "SUCCESS") {
          throw new Error(
            response.errorMessage || `Mint failed: ${response.txStatus}`
          )
        }

        console.log(`Minted ${amountWei} VEZ to ${to}, tx: ${response.txHash}`)
        runtime.log(`Mint completed: ${response.txHash}`)
        return { success: true, txHash: response.txHash, amount: amountWei.toString() }
      }

      case "transfer": {
        const { from, to, amount } = params as { from: string; to: string; amount: string }
        if (!from || !to || !amount) {
          throw new Error("Missing transfer parameters: from, to and amount required")
        }

        const amountWei = BigInt(amount)
        const writeData = encodeFunctionData({
          abi: VEZ_PROXY_ABI,
          functionName: "transfer",
          args: [to as Address, amountWei],
        })

        const report = runtime.report(prepareReportRequest(writeData)).result()
        const response = evm
          .writeReport(runtime, { receiver: VEZ_PROXY_ADDRESS, report })
          .result() as any

        if (response.txStatus !== "SUCCESS") {
          throw new Error(
            response.errorMessage || `Transfer failed: ${response.txStatus}`
          )
        }

        console.log(`Transferred ${amountWei} VEZ from ${from} to ${to}, tx: ${response.txHash}`)
        runtime.log(`Transfer completed: ${response.txHash}`)
        return { success: true, txHash: response.txHash, amount: amountWei.toString() }
      }

      case "obtain": {
        const { amount, proof } = params as { amount: string; proof: string }
        if (!amount || !proof) {
          throw new Error("Missing obtain parameters: amount and proof required")
        }

        const amountWei = BigInt(amount)
        const writeData = encodeFunctionData({
          abi: VEZ_PROXY_ABI,
          functionName: "obtain",
          args: [amountWei, proof],
        })

        const report = runtime.report(prepareReportRequest(writeData)).result()
        const response = evm
          .writeReport(runtime, { receiver: VEZ_PROXY_ADDRESS, report })
          .result() as any

        if (response.txStatus !== "SUCCESS") {
          throw new Error(
            response.errorMessage || `Obtain failed: ${response.txStatus}`
          )
        }

        console.log(`Obtained (burned) ${amountWei} VEZ, tx: ${response.txHash}`)
        runtime.log(`Obtain completed: ${response.txHash}`)
        return { success: true, txHash: response.txHash, amount: amountWei.toString() }
      }

      case "get-status": {
        const caller = runtime.config.receiverAddress
        
        const balanceData = encodeFunctionData({
          abi: VEZ_PROXY_ABI,
          functionName: "balanceOf",
          args: [caller as Address],
        })

        const call = encodeCallMsg({
          from: VEZ_PROXY_ADDRESS,
          to: VEZ_PROXY_ADDRESS,
          data: balanceData as `0x${string}`,
        })

        const reply = evm.callContract(runtime, {
          call,
          blockNumber: LAST_FINALIZED_BLOCK_NUMBER,
        }).result()

        return {
          success: true,
          balance: reply.data ? reply.data.toString() : "0",
          caller,
        }
      }

      default:
        throw new Error(`Unknown action: ${action}`)
    }
  } catch (error) {
    console.error("VEZ workflow error:", error)
    runtime.log(
      `Error: ${error instanceof Error ? error.message : String(error)}`
    )
    throw error
  }
}

// Export types for CRE SDK
export type { Runtime }