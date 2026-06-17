// Scale factor for bigint fixed-point math. Fractions like timeDelta/votingDuration would
// truncate to 0 in plain bigint; CLAIM_PRECISION keeps the precision before dividing,
// then is removed by the final division. Result is in wei.
const CLAIM_PRECISION = 10n ** 18n

// Reward owed to one voter on a proposal.
//
// Policy formula (from Liberdus DAO Voting Policy):
//   reward = voterRewardPool
//            * ( timeDelta / votingDuration / 2
//              + 1 / voterCount / 2 )
//
// Two equal halves:
//   timePart  — grows with the gap since the previous voter (earlier voters earn more).
//   equalPart — flat equal share split among all voters.
//
// voterRewardPool is fixed after the initial burn and stays the same across all claims.
// Callers must ensure votingDuration > 0 and voterCount > 0.
export function computeClaimReward(
  voterRewardPool: bigint, // post-burn pool, in wei
  timeDelta: bigint, // ms since the previous voter (or votingStart for first); clamped ≥ 0 by caller
  votingDuration: bigint, // total voting period in ms
  voterCount: bigint, // total voters on this proposal
): bigint {
  const timePart = (timeDelta * CLAIM_PRECISION) / votingDuration
  const equalPart = CLAIM_PRECISION / voterCount
  const rewardNumerator = voterRewardPool * (timePart + equalPart)
  return rewardNumerator / (2n * CLAIM_PRECISION)
}
