import { ethers } from 'ethers'
import { DaoMilestone } from '../@types'

const WEI = 10n ** 18n

/**
 * Converts a USD string to wei at a *fixed* rate, not the live one.
 *
 * Every project payout uses the rate snapshotted when the balance was minted, so the DAO's exposure
 * stays capped at what it actually minted and the contractor carries the LIB price movement. Mirrors
 * utils.usdStrToWei's arithmetic, but takes the rate as an argument instead of reading the network
 * account — which also keeps this module clear of the utils barrel and its import cycle.
 */
export function usdToWeiAtRate(usdStr: string, rateUsdStr: string): bigint {
  const rate = ethers.parseEther(rateUsdStr)
  if (rate === 0n) throw new Error('Project rate is zero; cannot convert USD to LIB')
  return (ethers.parseEther(usdStr) * WEI) / rate
}

export type MilestoneDeliverySpeed = 'early' | 'ontime' | 'late'

/**
 * Classifies a completed milestone against its planned duration.
 *
 * The policy sets the thresholds as a percentage of the planned duration: finishing more than
 * `bonusPercentage` faster earns the bonus, running more than `penaltyPercentage` over incurs the
 * penalty, and anything between is on time and paid the plain cost.
 *
 * Both comparisons are strict, so landing exactly on a threshold is "on time". That is the
 * conservative reading: the DAO neither pays a bonus nor levies a penalty for a boundary case.
 */
export function classifyDelivery(actualDuration: number, plannedDuration: number, bonusPercentage: number, penaltyPercentage: number): MilestoneDeliverySpeed {
  const earlyCutoff = plannedDuration * (1 - bonusPercentage / 100)
  const lateCutoff = plannedDuration * (1 + penaltyPercentage / 100)
  if (actualDuration < earlyCutoff) return 'early'
  if (actualDuration > lateCutoff) return 'late'
  return 'ontime'
}

export interface MilestonePayout {
  speed: MilestoneDeliverySpeed
  /** What the contractor is owed for this milestone, in wei, after bonus or penalty. */
  amountWei: bigint
}

/**
 * What a completed milestone pays out.
 *
 * A late milestone earns no bonus, so the penalty is deducted from the cost alone. It floors at
 * zero: a penalty larger than the cost reduces the payment to nothing but never makes the
 * contractor owe the DAO, and never adds back to the project balance. Without the floor a large
 * penalty would invert into a credit.
 *
 * The USD-to-wei converter is injected, and callers must supply one bound to the project's stored
 * rate rather than the live one — the DAO's exposure was fixed at the amount minted.
 */
export function milestonePayoutWei(
  milestone: DaoMilestone,
  bonusPercentage: number,
  penaltyPercentage: number,
  usdStrToWei: (usdStr: string) => bigint,
): MilestonePayout {
  const actualDuration = (milestone.endTime ?? 0) - (milestone.startTime ?? 0)
  const speed = classifyDelivery(actualDuration, milestone.duration, bonusPercentage, penaltyPercentage)

  const cost = usdStrToWei(milestone.costUsdStr)
  if (speed === 'early') {
    return { speed, amountWei: cost + usdStrToWei(milestone.bonusUsdStr) }
  }
  if (speed === 'late') {
    const penalty = usdStrToWei(milestone.penaltyUsdStr)
    // Floor at zero: a penalty larger than the cost reduces the payment to nothing, but never makes
    // the contractor owe the DAO and never adds back to the project balance.
    return { speed, amountWei: penalty >= cost ? 0n : cost - penalty }
  }
  return { speed, amountWei: cost }
}
