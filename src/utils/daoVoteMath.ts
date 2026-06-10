import Decimal from 'decimal.js'

// Isolated Decimal context for vote-weight math. Using Decimal (not Math.pow/Number) ensures
// consensus-critical calculations — especially the fractional voteExponent pow() — are
// deterministic across all nodes regardless of JS engine version or IEEE-754 rounding.
// precision: 40 is conservative since spend, voteExponent, and minimumSpend are unbounded
// or governance-mutable; tighten once explicit parameter bounds are enforced.
export const DaoDecimal = Decimal.clone({ precision: 40 })
export const WEI_PER_LIB = new DaoDecimal('1e18')
export const WEIGHT_PRECISION = new DaoDecimal('1e12')

// Time-decay: 1 in the first half of voting, then linearly decays to 0 by votingEnd.
export function getTimeMultiplier(txTimestamp: number, votingStart: number, votingEnd: number, halfDuration: number): Decimal {
  // Defensive guard for malformed zero-duration proposals; avoids division by zero in the decay calculation.
  if (halfDuration === 0) {
    return new DaoDecimal(1)
  }
  if (txTimestamp - votingStart <= halfDuration) {
    return new DaoDecimal(1)
  }
  // timeLeft / halfDuration decays from 1 → 0 over the second half; clamped at 0.
  return DaoDecimal.max(0, new DaoDecimal(votingEnd - txTimestamp).dividedBy(halfDuration))
}

export interface OptionWeightsInput {
  spend: bigint
  minimumSpendWei: bigint
  voteExponent: number
  weights: number[]
  timeMultiplier: Decimal
}

export interface VoteWeightDetails {
  totalSelectionWeight: number
  spendInLIB: Decimal
  spendBoost: Decimal
  baseWeight: Decimal
}

// Policy formula:
//   option[x] = voteSpend * (voteSpend / minimumSpend)^voteExponent
//               * timeLeftInSecondHalf / totalTimeInSecondHalf
//               * selectionWeight[x] / totalSelectionWeight
// baseWeight = spendInLIB * spendBoost * timeMultiplier * WEIGHT_PRECISION / totalSelectionWeight
// pre-divides by totalSelectionWeight so each loop iteration just multiplies by weights[i].
// WEIGHT_PRECISION (1e12) scales the result into a bigint without losing sub-LIB precision.
//
// Callers (dao_vote.apply() and any tooling/scripts) must supply already-validated inputs:
//   - `weights` is non-empty with a positive sum (totalSelectionWeight > 0) and the sum is a safe integer
//   - `minimumSpendWei` is positive (used as a divisor)
// Production `dao_vote.validate()` enforces both; this function does not re-check them and
// will produce NaN/Infinity/division-by-zero results if they don't hold.
export function calculateVoteWeightDetails({ spend, minimumSpendWei, voteExponent, weights, timeMultiplier }: OptionWeightsInput): VoteWeightDetails {
  const totalSelectionWeight = weights.reduce((sum, w) => sum + w, 0)
  const spendInLIB = new DaoDecimal(spend.toString()).dividedBy(WEI_PER_LIB)
  const spendBoost = new DaoDecimal(spend.toString()).dividedBy(minimumSpendWei.toString()).pow(voteExponent)
  const baseWeight = spendInLIB.times(spendBoost).times(timeMultiplier).times(WEIGHT_PRECISION).dividedBy(totalSelectionWeight)
  return { totalSelectionWeight, spendInLIB, spendBoost, baseWeight }
}

export function calculateOptionWeights(input: OptionWeightsInput): bigint[] {
  const { weights } = input
  const { baseWeight } = calculateVoteWeightDetails(input)

  const optionWeights: bigint[] = weights.map(() => 0n)
  for (let i = 0; i < weights.length; i++) {
    if (weights[i] <= 0) continue
    optionWeights[i] = BigInt(baseWeight.times(weights[i]).floor().toFixed())
  }
  return optionWeights
}
