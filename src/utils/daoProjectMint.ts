import { ethers } from 'ethers'
import { LiberdusFlags } from '../config'
import { DaoMilestone } from '../@types'

/**
 * The configured per-project mint ceiling, in wei.
 *
 * Stored as a decimal string so the flag stays JSON-safe and settable through the debug endpoint;
 * parseEther reads it exactly, with no float rounding.
 *
 * Throws on a malformed value rather than defaulting. A ceiling that silently becomes something
 * other than what an operator configured is worse than a failed transaction, and the throw surfaces
 * in validation — so a bad value stops mints rather than widening them.
 */
export function maxMintThresholdWei(): bigint {
  const configured = LiberdusFlags.daoMaxMintThresholdLibStr
  let parsed: bigint
  try {
    parsed = ethers.parseEther(configured)
  } catch {
    throw new Error(`daoMaxMintThresholdLibStr ("${configured}") is not a valid decimal LIB string`)
  }
  if (parsed < 0n) {
    throw new Error(`daoMaxMintThresholdLibStr ("${configured}") must not be negative`)
  }
  return parsed
}

/** True when minting `amountWei` would exceed the ceiling. Strictly greater — equality is allowed. */
export function exceedsMintThreshold(amountWei: bigint): boolean {
  return amountWei > maxMintThresholdWei()
}

/**
 * The most a project could ever owe: every milestone's cost plus its early-delivery bonus.
 *
 * Penalties are excluded — a penalty only reduces what a contractor is paid, so folding it in would
 * mint more escrow than the project can legitimately pay out.
 *
 * The converter is injected rather than imported to keep this module clear of the utils barrel and
 * its config/utils cycle. That is why this differs from milestonePayoutWei, which takes the project:
 * the mint converts at the *live* rate, which only the caller can reach.
 */
export function projectMintAmountWei(milestones: DaoMilestone[], usdStrToWei: (usdStr: string) => bigint): bigint {
  return milestones.reduce((total, m) => total + usdStrToWei(m.costUsdStr) + usdStrToWei(m.bonusUsdStr), 0n)
}

/**
 * Repeats the creation-time `penalty < cost` rule in wei, at the rate the project is about to fix.
 *
 * Creation compares USD strings, but payouts are truncating divisions by the rate, so two amounts
 * that differ in USD can land on the same wei value — "0.000000000000000002" and
 * "0.000000000000000001" both truncate to 0 at a large enough rate. That would make a late payout
 * zero and leave the milestone claimable forever under `paid > 0n`.
 *
 * The rate is unknown at creation but known here, and fixed for the project's life once snapshotted,
 * so one check covers every later payout.
 */
export function degenerateMilestoneAtRate(milestones: DaoMilestone[], usdStrToWei: (usdStr: string) => bigint): string | undefined {
  for (const [i, m] of milestones.entries()) {
    const costWei = usdStrToWei(m.costUsdStr)
    const penaltyWei = usdStrToWei(m.penaltyUsdStr)
    if (penaltyWei >= costWei) {
      return `milestones[${i}] converts to a penalty of ${penaltyWei} wei against a cost of ${costWei} wei at the current rate, which would allow a zero payout`
    }
  }
  return undefined
}
