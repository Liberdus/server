import { ethers } from 'ethers'
import { DaoMilestone, DaoProjectData } from '../@types'

const WEI = 10n ** 18n

/**
 * Converts USD to wei at a fixed rate, not the live one.
 *
 * Payouts use the rate snapshotted at mint, so the DAO's exposure stays capped at what it minted and
 * the contractor carries the price movement. Taking the rate as an argument rather than reading the
 * network account also keeps this module clear of the utils barrel and its import cycle.
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
 * Both comparisons are strict, so landing exactly on a threshold is on time — the DAO neither pays a
 * bonus nor levies a penalty for a boundary case.
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
 * Takes the project rather than a rate or a converter, so a payout cannot be computed at the live
 * rate by mistake. That error has been made here once already.
 *
 * A payout of zero is unreachable — `penalty < cost` is enforced at proposal creation and repeated
 * in wei at dao_project_start — which is what lets `paid > 0n` mean "settled" in
 * dao_project_milestone_claim. The zero floor below is kept as the only thing between a future gap
 * in those checks and a negative payout.
 */
export function milestonePayoutWei(milestone: DaoMilestone, project: DaoProjectData): MilestonePayout {
  const usdStrToWei = (usdStr: string): bigint => usdToWeiAtRate(usdStr, project.rateUsdStr)

  // Fail closed: defaulting a missing timestamp to zero made the duration negative, which reads as
  // `early` and pays cost plus bonus. The inversion check is separate because the two times are
  // proposed and endorsed independently and nothing else compares them — equal times are a
  // legitimate zero-length milestone, inverted ones are not.
  if (milestone.startTime === undefined || milestone.endTime === undefined) {
    throw new Error('Milestone is missing a start or end time; cannot compute a payout')
  }
  if (milestone.endTime < milestone.startTime) {
    throw new Error(`Milestone end time (${milestone.endTime}) is before its start time (${milestone.startTime}); cannot compute a payout`)
  }
  const actualDuration = milestone.endTime - milestone.startTime
  const speed = classifyDelivery(actualDuration, milestone.duration, project.durationBonusPercentage, project.durationPenaltyPercentage)

  const cost = usdStrToWei(milestone.costUsdStr)
  if (speed === 'early') {
    return { speed, amountWei: cost + usdStrToWei(milestone.bonusUsdStr) }
  }
  if (speed === 'late') {
    const penalty = usdStrToWei(milestone.penaltyUsdStr)
    // Unreachable while the creation rule and the start-time guard both hold — see the note above.
    return { speed, amountWei: penalty >= cost ? 0n : cost - penalty }
  }
  return { speed, amountWei: cost }
}
