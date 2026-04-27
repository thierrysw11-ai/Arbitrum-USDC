// Build: v0.5.0 (2026-04-27) — force-republish to land a fresh deployment ID
// on the decentralized network. Adds a structured whale-transfer log with
// from/to addresses (was just value+tx in v0.3.1) so the compiled WASM hash
// genuinely differs from the previously-published version.

import { BigInt, log } from "@graphprotocol/graph-ts"
import { Transfer } from "../generated/USDC/USDC"
import {
  Transfer as TransferEntity,
  HourlyVolume,
} from "../generated/schema"

// USDC is 6 decimals. Whale threshold = 1,000,000 USDC = 1e12 in raw units.
const WHALE_THRESHOLD = BigInt.fromString("1000000000000")
const HOUR = BigInt.fromI32(3600)
const BUILD_TAG = "usdc-subgraph@v0.5.0"

export function handleTransfer(event: Transfer): void {
  // 1. Persist the raw Transfer event (immutable).
  let transferId =
    event.transaction.hash.toHex() + "-" + event.logIndex.toString()
  let entity = new TransferEntity(transferId)
  entity.from = event.params.from
  entity.to = event.params.to
  entity.value = event.params.value
  entity.blockNumber = event.block.number
  entity.timestamp = event.block.timestamp
  entity.txHash = event.transaction.hash
  entity.save()

  // 2. Upsert the hourly aggregate bucket this transfer falls into.
  let hourStart = event.block.timestamp.div(HOUR).times(HOUR)
  let hourId = hourStart.toString()

  let hourly = HourlyVolume.load(hourId)
  if (hourly == null) {
    hourly = new HourlyVolume(hourId)
    hourly.hourStartTimestamp = hourStart
    hourly.totalVolume = BigInt.zero()
    hourly.whaleVolume = BigInt.zero()
    hourly.transferCount = 0
  }
  hourly.totalVolume = hourly.totalVolume.plus(event.params.value)
  if (event.params.value.ge(WHALE_THRESHOLD)) {
    hourly.whaleVolume = hourly.whaleVolume.plus(event.params.value)
    log.info(
      "[{}] whale transfer: from {} to {} value {} raw, tx {}",
      [
        BUILD_TAG,
        event.params.from.toHexString(),
        event.params.to.toHexString(),
        event.params.value.toString(),
        event.transaction.hash.toHex(),
      ]
    )
  }
  hourly.transferCount = hourly.transferCount + 1
  hourly.save()
}
