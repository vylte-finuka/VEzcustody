import { CronCapability, handler, Runner, type Runtime, EVMClient, getNetwork, encodeCallMsg, LAST_FINALIZED_BLOCK_NUMBER, prepareReportRequest, TxStatus } from "@chainlink/cre-sdk"
import { encodeFunctionData, type Address, bytesToHex, decodeFunctionResult, zeroAddress } from "viem"
import { VEZ_PROXY_ABI, AGGREGATOR_ABI } from "../contracts/abi"

type Config = {
  schedule: string
  chainSelectorName: string
  vezProxyAddress: string
  aggregatorAddress: string
  initialRecipient: string
  custodianAddress: string
  vezReceiverAddress: string
}

// 888 M VEZ = 888,000,000 * 10^18 wei
const INITIAL_MINT_AMOUNT = 888_000_000n * 10n**18n
// MAX_MINT_PER_TX = 1,000,000 * 10^18 (from contract)
const MAX_MINT_PER_TX = 1_000_000n * 10n**18n

// Slura chain selector (local node: chainId 45057, RPC http://localhost:8081)
const SLURA_CHAIN_SELECTOR = 3034092155422581607n

const onCronTrigger = async (runtime: Runtime<Config>): Promise<string> => {
  // Use Slura selector for EVM calls (node pre-deploys contracts at fixed addresses)
  const evm = new EVMClient(SLURA_CHAIN_SELECTOR)

  // 1. Vérifier réserves (oracle EACAggregatorProxy)
  const reserveCall = encodeCallMsg({
    from: zeroAddress,
    to: runtime.config.aggregatorAddress as Address,
    data: encodeFunctionData({ abi: AGGREGATOR_ABI, functionName: "getFullRoundData", args: [] })
  })
  const reserveReply = evm.callContract(runtime, { call: reserveCall, blockNumber: LAST_FINALIZED_BLOCK_NUMBER }).result()
  const [roundId, answer] = decodeFunctionResult({ abi: AGGREGATOR_ABI, functionName: "getFullRoundData", data: bytesToHex(reserveReply.data!) }) as [bigint, bigint]
  runtime.log(`VEZ PoR round=${roundId} answer=${answer}`)

  // 2. Mint initial 888 M VEZ (split into multiple txs if needed)
  let remainingMint = INITIAL_MINT_AMOUNT
  let totalMinted = 0n
  const mintTxHashes: string[] = []

  while (remainingMint > 0) {
    const mintAmount = remainingMint > MAX_MINT_PER_TX ? MAX_MINT_PER_TX : remainingMint
    const mintData = encodeFunctionData({
      abi: VEZ_PROXY_ABI,
      functionName: "mint",
      args: [runtime.config.initialRecipient as Address, mintAmount]
    })
    const report = runtime.report(prepareReportRequest(mintData)).result()
    const mintResp = evm.writeReport(runtime, {
      receiver: runtime.config.vezReceiverAddress as Address,
      report
    }).result()

    if (mintResp.txStatus !== TxStatus.SUCCESS) {
      throw new Error(`Mint failed: txStatus=${mintResp.txStatus}, txHash=${mintResp.txHash}`)
    }

    mintTxHashes.push(bytesToHex(mintResp.txHash!))
    totalMinted += mintAmount
    remainingMint -= mintAmount
    runtime.log(`Mint ${mintAmount / 10n**18n} VEZ: txHash=${bytesToHex(mintResp.txHash!)}`)
  }

  // 3. Vérifier totalSupply après mint
  const supplyCall = encodeCallMsg({
    from: zeroAddress,
    to: runtime.config.vezProxyAddress as Address,
    data: encodeFunctionData({ abi: VEZ_PROXY_ABI, functionName: "totalSupply", args: [] })
  })
  const supplyReply = evm.callContract(runtime, { call: supplyCall, blockNumber: LAST_FINALIZED_BLOCK_NUMBER }).result()
  const [totalSupply] = decodeFunctionResult({ abi: VEZ_PROXY_ABI, functionName: "totalSupply", data: bytesToHex(supplyReply.data!) }) as [bigint]
  runtime.log(`Total supply after mint: ${totalSupply}`)

  // 4. Vérifier balance du recipient
  const balanceCall = encodeCallMsg({
    from: zeroAddress,
    to: runtime.config.vezProxyAddress as Address,
    data: encodeFunctionData({ abi: VEZ_PROXY_ABI, functionName: "balanceOf", args: [runtime.config.initialRecipient as Address] })
  })
  const balanceReply = evm.callContract(runtime, { call: balanceCall, blockNumber: LAST_FINALIZED_BLOCK_NUMBER }).result()
  const [balance] = decodeFunctionResult({ abi: VEZ_PROXY_ABI, functionName: "balanceOf", data: bytesToHex(balanceReply.data!) }) as [bigint]
  runtime.log(`Recipient balance: ${balance}`)

  // 5. Mise à jour oracle (updateRoundData) - seulement si owner
  const updateData = encodeFunctionData({
    abi: AGGREGATOR_ABI,
    functionName: "updateRoundData",
    args: [answer, runtime.now()]
  })
  const updateReport = runtime.report(prepareReportRequest(updateData)).result()
  const updateResp = evm.writeReport(runtime, {
    receiver: runtime.config.vezReceiverAddress as Address,
    report: updateReport
  }).result()

  if (updateResp.txStatus !== TxStatus.SUCCESS) {
    runtime.log(`Oracle update failed: txStatus=${updateResp.txStatus}`)
  } else {
    runtime.log(`Oracle update: txHash=${bytesToHex(updateResp.txHash!)}`)
  }

  return `VEZ initial mint complete: totalMinted=${totalMinted / 10n**18n} VEZ, txs=${mintTxHashes.length}, supply=${totalSupply}, balance=${balance}, oracle=${updateResp.txStatus}`
}

const initWorkflow = (config: Config) => {
  const cron = new CronCapability()
  return [handler(cron.trigger({ schedule: config.schedule }), onCronTrigger)]
}

export async function main() {
  const runner = await Runner.newRunner<Config>()
  await runner.run(initWorkflow)
}