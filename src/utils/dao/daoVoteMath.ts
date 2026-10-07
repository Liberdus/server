import Decimal from 'decimal.js'

// Isolated Decimal context for vote-weight math. Using Decimal (not Math.pow/Number) ensures
// consensus-critical calculations — especially the fractional voteExponent pow() — are
// deterministic across all nodes regardless of JS engine version or IEEE-754 rounding.
// precision: 40 is a buffer for the unbounded ranges of spend, voteExponent, and minimumSpend;
// tighten once explicit bounds on those parameters are enforced.
export const DaoDecimal = Decimal.clone({ precision: 40 })
export const WEI_PER_LIB = new DaoDecimal('1e18')

// Scales the Decimal weight into a bigint-safe integer at micro-LIB resolution.
export const WEIGHT_PRECISION = new DaoDecimal('1e12')

// Time-decay multiplier for a vote.
// First half of the voting period → always 1 (full weight).
// Second half → linearly decays to 0 at votingEnd so late votes count less.
// Policy term: timeLeftInSecondHalf / totalTimeInSecondHalf
export function getTimeMultiplier(txTimestamp: number, votingStart: number, votingEnd: number, halfDuration: number): Decimal {
  // Defensive guard for malformed zero-duration proposals; avoids division by zero in the decay calculation.
  if (halfDuration === 0) {
    return new DaoDecimal(1)
  }
  if (txTimestamp - votingStart <= halfDuration) {
    return new DaoDecimal(1)
  }
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

// Vote weight components for a single vote.
//
// Policy formula (from Liberdus DAO Voting Policy):
//   option[x] = voteSpend
//               * (voteSpend / minimumSpend) ^ voteExponent
//               * timeLeftInSecondHalf / totalTimeInSecondHalf
//               * selectionWeight[x] / totalSelectionWeight
//
//   spendInLIB     = spend / 1e18  (converts wei to LIB for human-scale numbers)
//   spendBoost     = (spend / minimumSpend) ^ voteExponent  (exponent-scaled — spend boost grows with voteExponent)
//   timeMultiplier = getTimeMultiplier()  (decays in the second half; see that function)
//   baseWeight     = spendInLIB * spendBoost * timeMultiplier * WEIGHT_PRECISION / totalSelectionWeight
//                    (pre-divided by totalSelectionWeight so each option just multiplies by its weight)
//
// Assumes weights has a positive sum and minimumSpendWei > 0 (enforced by dao_vote.validate()).
export function calculateVoteWeightDetails({ spend, minimumSpendWei, voteExponent, weights, timeMultiplier }: OptionWeightsInput): VoteWeightDetails {
  const totalSelectionWeight = weights.reduce((sum, w) => sum + w, 0)
  const spendInLIB = new DaoDecimal(spend.toString()).dividedBy(WEI_PER_LIB)
  const spendBoost = new DaoDecimal(spend.toString()).dividedBy(minimumSpendWei.toString()).pow(voteExponent)
  const baseWeight = spendInLIB.times(spendBoost).times(timeMultiplier).times(WEIGHT_PRECISION).dividedBy(totalSelectionWeight)
  return { totalSelectionWeight, spendInLIB, spendBoost, baseWeight }
}

// Spreads the base vote weight across all options according to the voter's split.
// Returns one bigint per option; floor() ensures rounding never inflates any option.
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
