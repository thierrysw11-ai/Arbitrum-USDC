// Aave V3 Arbitrum — Pool event handlers
//
// Indexes the Pool proxy at 0x794a61358D6845594F94dc1DB02A252b5b4814aD.
// On every event we:
//   1. Lazily resolve the Reserve entity (creating it on first sight and
//      pulling ERC20 metadata directly from the underlying token contract,
//      which is what fixes the empty-symbol "???" rendering bug).
//   2. Create the per-event entity (immutable, keyed by tx-logIndex).
//   3. Update Reserve principal aggregates and the DailyReserveStat bucket
//      that powers the 7-day activity sparklines.

import { Address, BigInt, Bytes, ethereum, log } from "@graphprotocol/graph-ts";

import {
  Supply as SupplyEvent,
  Withdraw as WithdrawEvent,
  Borrow as BorrowEvent,
  Repay as RepayEvent,
  LiquidationCall as LiquidationCallEvent,
  FlashLoan as FlashLoanEvent,
  ReserveDataUpdated as ReserveDataUpdatedEvent,
} from "../generated/Pool/Pool";
import { ERC20 } from "../generated/Pool/ERC20";
import {
  Reserve,
  Account,
  Supply,
  Borrow,
  Repay,
  Liquidation,
  FlashLoan,
  DailyReserveStat,
} from "../generated/schema";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SECONDS_PER_DAY = BigInt.fromI32(86400);

// Build tag — bumped on every release so The Graph Studio sees a fresh
// deployment hash even if the schema is unchanged. Wired into a log.info
// call inside handleLiquidationCall to guarantee the AssemblyScript compiler
// can't tree-shake it out of the WASM.
const BUILD_TAG = "aave-subgraph@v0.4.0";

function eventId(event: ethereum.Event): string {
  return event.transaction.hash.toHexString() + "-" + event.logIndex.toString();
}

function getOrCreateAccount(addr: Address): Account {
  const id = addr.toHexString();
  let account = Account.load(id);
  if (account == null) {
    account = new Account(id);
    account.save();
  }
  return account;
}

function getOrCreateReserve(asset: Address, blockTimestamp: BigInt): Reserve {
  const id = asset.toHexString();
  let reserve = Reserve.load(id);
  if (reserve != null) {
    return reserve;
  }

  reserve = new Reserve(id);
  reserve.asset = asset as Bytes;

  // Pull ERC20 metadata. Some Arbitrum tokens occasionally revert on these
  // calls when proxies are mid-upgrade, so we fall back to safe defaults.
  const erc20 = ERC20.bind(asset);

  const symbolCall = erc20.try_symbol();
  reserve.symbol = symbolCall.reverted ? "" : symbolCall.value;

  const nameCall = erc20.try_name();
  reserve.name = nameCall.reverted ? "" : nameCall.value;

  const decimalsCall = erc20.try_decimals();
  reserve.decimals = decimalsCall.reverted ? 18 : decimalsCall.value;

  reserve.liquidityRate = BigInt.zero();
  reserve.variableBorrowRate = BigInt.zero();
  reserve.liquidityIndex = BigInt.zero();
  reserve.variableBorrowIndex = BigInt.zero();

  reserve.totalSupply = BigInt.zero();
  reserve.totalBorrow = BigInt.zero();
  reserve.lastUpdatedAt = blockTimestamp;

  reserve.save();
  return reserve;
}

function getOrCreateDailyStat(
  reserve: Reserve,
  blockTimestamp: BigInt
): DailyReserveStat {
  const dayStart = blockTimestamp.div(SECONDS_PER_DAY).times(SECONDS_PER_DAY);
  const id = reserve.id + "-" + dayStart.toString();
  let stat = DailyReserveStat.load(id);
  if (stat == null) {
    stat = new DailyReserveStat(id);
    stat.reserve = reserve.id;
    stat.date = dayStart;
    stat.supplyVolume = BigInt.zero();
    stat.supplyCount = 0;
    stat.borrowVolume = BigInt.zero();
    stat.borrowCount = 0;
    stat.repayVolume = BigInt.zero();
    stat.repayCount = 0;
    stat.liquidationCount = 0;
    stat.flashLoanVolume = BigInt.zero();
    stat.flashLoanCount = 0;
  }
  return stat;
}

// ---------------------------------------------------------------------------
// Event handlers
// ---------------------------------------------------------------------------

export function handleSupply(event: SupplyEvent): void {
  const reserve = getOrCreateReserve(event.params.reserve, event.block.timestamp);
  const user = getOrCreateAccount(event.params.user);

  const supply = new Supply(eventId(event));
  supply.reserve = reserve.id;
  supply.user = user.id;
  supply.onBehalfOf = event.params.onBehalfOf as Bytes;
  supply.amount = event.params.amount;
  supply.blockNumber = event.block.number;
  supply.timestamp = event.block.timestamp;
  supply.txHash = event.transaction.hash;
  supply.save();

  reserve.totalSupply = reserve.totalSupply.plus(event.params.amount);
  reserve.lastUpdatedAt = event.block.timestamp;
  reserve.save();

  const stat = getOrCreateDailyStat(reserve, event.block.timestamp);
  stat.supplyVolume = stat.supplyVolume.plus(event.params.amount);
  stat.supplyCount = stat.supplyCount + 1;
  stat.save();
}

export function handleWithdraw(event: WithdrawEvent): void {
  const reserve = getOrCreateReserve(event.params.reserve, event.block.timestamp);

  // Withdraws decrement the principal aggregate. We don't materialize a
  // dedicated Withdraw entity yet — the schema only exposes derived lists
  // for the four user-facing events the Markets table cares about. Keep
  // this lightweight; if a per-withdraw feed becomes needed later, add the
  // entity to schema.graphql and emit it here.
  if (reserve.totalSupply.ge(event.params.amount)) {
    reserve.totalSupply = reserve.totalSupply.minus(event.params.amount);
  } else {
    // Defensive: never let totals go negative if we somehow missed a Supply.
    reserve.totalSupply = BigInt.zero();
    log.warning("Withdraw underflow on reserve {}: amount {} exceeded total {}", [
      reserve.id,
      event.params.amount.toString(),
      reserve.totalSupply.toString(),
    ]);
  }
  reserve.lastUpdatedAt = event.block.timestamp;
  reserve.save();
}

export function handleBorrow(event: BorrowEvent): void {
  const reserve = getOrCreateReserve(event.params.reserve, event.block.timestamp);
  const user = getOrCreateAccount(event.params.user);

  const borrow = new Borrow(eventId(event));
  borrow.reserve = reserve.id;
  borrow.user = user.id;
  borrow.onBehalfOf = event.params.onBehalfOf as Bytes;
  borrow.amount = event.params.amount;
  borrow.borrowRate = event.params.borrowRate;
  borrow.interestRateMode = event.params.interestRateMode;
  borrow.blockNumber = event.block.number;
  borrow.timestamp = event.block.timestamp;
  borrow.txHash = event.transaction.hash;
  borrow.save();

  reserve.totalBorrow = reserve.totalBorrow.plus(event.params.amount);
  reserve.lastUpdatedAt = event.block.timestamp;
  reserve.save();

  const stat = getOrCreateDailyStat(reserve, event.block.timestamp);
  stat.borrowVolume = stat.borrowVolume.plus(event.params.amount);
  stat.borrowCount = stat.borrowCount + 1;
  stat.save();
}

export function handleRepay(event: RepayEvent): void {
  const reserve = getOrCreateReserve(event.params.reserve, event.block.timestamp);
  const borrower = getOrCreateAccount(event.params.user);
  const repayer = getOrCreateAccount(event.params.repayer);

  const repay = new Repay(eventId(event));
  repay.reserve = reserve.id;
  repay.user = borrower.id;
  repay.repayer = repayer.id;
  repay.amount = event.params.amount;
  repay.useATokens = event.params.useATokens;
  repay.blockNumber = event.block.number;
  repay.timestamp = event.block.timestamp;
  repay.txHash = event.transaction.hash;
  repay.save();

  if (reserve.totalBorrow.ge(event.params.amount)) {
    reserve.totalBorrow = reserve.totalBorrow.minus(event.params.amount);
  } else {
    reserve.totalBorrow = BigInt.zero();
  }
  reserve.lastUpdatedAt = event.block.timestamp;
  reserve.save();

  const stat = getOrCreateDailyStat(reserve, event.block.timestamp);
  stat.repayVolume = stat.repayVolume.plus(event.params.amount);
  stat.repayCount = stat.repayCount + 1;
  stat.save();
}

export function handleLiquidationCall(event: LiquidationCallEvent): void {
  const collateral = getOrCreateReserve(
    event.params.collateralAsset,
    event.block.timestamp
  );
  const debt = getOrCreateReserve(event.params.debtAsset, event.block.timestamp);
  const user = getOrCreateAccount(event.params.user);

  const liq = new Liquidation(eventId(event));
  liq.collateralAsset = collateral.id;
  liq.debtAsset = debt.id;
  liq.user = user.id;
  liq.liquidator = event.params.liquidator as Bytes;
  liq.debtToCover = event.params.debtToCover;
  liq.liquidatedCollateralAmount = event.params.liquidatedCollateralAmount;
  liq.receiveAToken = event.params.receiveAToken;
  liq.blockNumber = event.block.number;
  liq.timestamp = event.block.timestamp;
  liq.txHash = event.transaction.hash;
  liq.save();

  log.info(
    "[{}] liquidation: user {} debt {} ({}) collateral {} ({}) tx {}",
    [
      BUILD_TAG,
      event.params.user.toHexString(),
      event.params.debtAsset.toHexString(),
      event.params.debtToCover.toString(),
      event.params.collateralAsset.toHexString(),
      event.params.liquidatedCollateralAmount.toString(),
      event.transaction.hash.toHexString(),
    ]
  );

  // Liquidations consume both collateral and debt — the actual subledger
  // movements (aToken burn / debt burn) flow through Withdraw/Repay events
  // emitted in the same tx, so we don't double-count totals here. We just
  // bump the per-day liquidation counter on the *debt* reserve since that's
  // the one most users want to see "got liquidated" stats against.
  const stat = getOrCreateDailyStat(debt, event.block.timestamp);
  stat.liquidationCount = stat.liquidationCount + 1;
  stat.save();
}

export function handleFlashLoan(event: FlashLoanEvent): void {
  const reserve = getOrCreateReserve(event.params.asset, event.block.timestamp);

  const fl = new FlashLoan(eventId(event));
  fl.asset = reserve.id;
  fl.target = event.params.target as Bytes;
  fl.initiator = event.params.initiator as Bytes;
  fl.amount = event.params.amount;
  fl.interestRateMode = event.params.interestRateMode;
  fl.premium = event.params.premium;
  fl.blockNumber = event.block.number;
  fl.timestamp = event.block.timestamp;
  fl.txHash = event.transaction.hash;
  fl.save();

  const stat = getOrCreateDailyStat(reserve, event.block.timestamp);
  stat.flashLoanVolume = stat.flashLoanVolume.plus(event.params.amount);
  stat.flashLoanCount = stat.flashLoanCount + 1;
  stat.save();
}

export function handleReserveDataUpdated(event: ReserveDataUpdatedEvent): void {
  // ReserveDataUpdated fires on essentially every state-changing call, so
  // this is by far the hottest handler. Keep it lean: just snapshot the
  // four ray-scaled rates that the Markets table reads.
  const reserve = getOrCreateReserve(event.params.reserve, event.block.timestamp);
  reserve.liquidityRate = event.params.liquidityRate;
  reserve.variableBorrowRate = event.params.variableBorrowRate;
  reserve.liquidityIndex = event.params.liquidityIndex;
  reserve.variableBorrowIndex = event.params.variableBorrowIndex;
  reserve.lastUpdatedAt = event.block.timestamp;
  reserve.save();
}
