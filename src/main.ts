import {
  EVMClient,
  getNetwork,
  encodeFunctionData,
  prepareReportRequest,
  TxStatus,
  type Runtime,
} from "@chainlink/cre-sdk"
import { z } from "zod"

const ConfigSchema = z.object({
  chainSelectorName: z.string(),
  receiverAddress: z.string(),
  contractAddress: z.string(),
})

type Config = z.infer<typeof ConfigSchema>

const CONTRACT_ABI = [
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
] as const

export const handler = async (runtime: Runtime) => {
  const config = ConfigSchema.parse(runtime.getConfig())
  const network = getNetwork({
    chainFamily: "evm",
    chainSelectorName: config.chainSelectorName,
    isTestnet: true,
  })
  if (!network) throw new Error(`Network not found: ${config.chainSelectorName}`)

  const evmClient = new EVMClient(network.chainSelector.selector)

  const writeData = encodeFunctionData({
    abi: CONTRACT_ABI,
    functionName: "mint",
    args: [config.receiverAddress, 1000000000000000000n],
  })

  const report = runtime.report(prepareReportRequest(writeData)).result()
  const response = evmClient
    .writeReport(runtime, { receiver: config.receiverAddress, report })
    .result()

  if (response.txStatus !== TxStatus.SUCCESS) {
    throw new Error(response.errorMessage || `Write failed: ${response.txStatus}`)
  }
  return { success: true, txHash: response.txHash }
}
