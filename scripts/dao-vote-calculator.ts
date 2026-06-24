/**
 * Non-interactive dao_vote weight simulator.
 *
 * Reuses the exact same math as src/transactions/dao/dao_vote.ts (via daoVoteMath.ts) and the
 * derived-timing helpers from src/accounts/daoProposalAccount.ts, so results match the
 * production handler precisely.
 *
 * Edit the SCENARIOS array below and re-run:
 *   npx ts-node --project tsconfig.scripts.json scripts/dao-vote-calculator.ts
 *   (or: npm run dao:vote-calc)
 */

import { getVotingStart, getVotingEnd } from '../src/accounts/daoProposalAccount'
import { getTimeMultiplier, calculateOptionWeights, calculateVoteWeightDetails, DaoDecimal, WEI_PER_LIB, WEIGHT_PRECISION } from '../src/utils/daoVoteMath'
import { libToWei } from '../src/utils'
import { DaoProposalAccount } from '../src/@types'

interface Scenario {
  name: string
  // Proposal timing/params (seconds for durations, epoch seconds for startTime)
  startTime: number
  reviewDuration: number
  votingDuration: number
  emergency: boolean
  minimumSpendLib: number
  voteExponent: number
  // Vote tx inputs
  spendLib: number
  weights: number[]
  // When the vote is cast, expressed as an offset (seconds) from votingStart
  castAtOffsetFromVotingStart: number
}

const SCENARIOS: Scenario[] = [
  {
    name: 'Early vote, first half of voting window (full time multiplier)',
    startTime: 0,
    reviewDuration: 90,
    votingDuration: 90,
    emergency: false,
    minimumSpendLib: 1,
    voteExponent: 1.1,
    spendLib: 200,
    weights: [1, 2, 1],
    castAtOffsetFromVotingStart: 10, // well within first half (halfDuration = 45s)
  },
  {
    name: 'Vote cast exactly at halfDuration boundary (still full multiplier)',
    startTime: 0,
    reviewDuration: 90,
    votingDuration: 90,
    emergency: false,
    minimumSpendLib: 1,
    voteExponent: 1.1,
    spendLib: 200,
    weights: [1, 2, 1],
    castAtOffsetFromVotingStart: 45, // == halfDuration
  },
  {
    name: 'Late vote, three-quarters through voting window (decayed multiplier)',
    startTime: 0,
    reviewDuration: 90,
    votingDuration: 90,
    emergency: false,
    minimumSpendLib: 1,
    voteExponent: 1.1,
    spendLib: 200,
    weights: [1, 2, 1],
    castAtOffsetFromVotingStart: 67, // 45 + 22.5 -> ~half of the second half elapsed
  },
  {
    name: 'Vote cast at votingEnd (multiplier ~0)',
    startTime: 0,
    reviewDuration: 90,
    votingDuration: 90,
    emergency: false,
    minimumSpendLib: 1,
    voteExponent: 1.1,
    spendLib: 200,
    weights: [1, 2, 1],
    castAtOffsetFromVotingStart: 90, // == votingDuration -> at votingEnd
  },
  {
    name: 'Higher spend relative to minimumSpend (spendBoost grows with voteExponent)',
    startTime: 0,
    reviewDuration: 90,
    votingDuration: 90,
    emergency: false,
    minimumSpendLib: 1,
    voteExponent: 1.1,
    spendLib: 1000,
    weights: [1, 1],
    castAtOffsetFromVotingStart: 0,
  },
  {
    name: 'Single-option vote (all weight on option 0)',
    startTime: 0,
    reviewDuration: 90,
    votingDuration: 90,
    emergency: false,
    minimumSpendLib: 1,
    voteExponent: 1.1,
    spendLib: 200,
    weights: [1, 0, 0],
    castAtOffsetFromVotingStart: 0,
  },
]

// Builds only the fields the timing helpers actually read — avoids invoking the full
// daoProposalAccount() factory (which hashes the account and isn't needed here).
// minimumSpendWei is computed separately below since the proposal only stores a USD-string snapshot.
function buildProposal(scenario: Scenario): Pick<DaoProposalAccount, 'startTime' | 'reviewDuration' | 'votingDuration' | 'emergency' | 'voteExponent' | 'options'> {
  return {
    startTime: scenario.startTime,
    reviewDuration: scenario.reviewDuration,
    votingDuration: scenario.votingDuration,
    emergency: scenario.emergency,
    voteExponent: scenario.voteExponent,
    options: scenario.weights.map((_, i) => `Option ${i}`),
  }
}

function formatWei(wei: bigint): string {
  return `${wei.toString()} wei (${new DaoDecimal(wei.toString()).dividedBy(WEI_PER_LIB).toString()} LIB)`
}

for (const scenario of SCENARIOS) {
  console.log(`\n=== ${scenario.name} ===`)

  const proposal = buildProposal(scenario)
  const minimumSpendWei = libToWei(scenario.minimumSpendLib)
  console.log(`  [1] minimumSpendWei: ${minimumSpendWei.toString()} (= ${scenario.minimumSpendLib} LIB * 1e18)`)
  console.log(`  [1] voteExponent:    ${proposal.voteExponent}`)

  const votingStart = getVotingStart(proposal as DaoProposalAccount)
  const votingEnd = getVotingEnd(proposal as DaoProposalAccount)
  const halfDuration = proposal.votingDuration / 2
  console.log(`  [2] votingStart:     ${votingStart} (= startTime ${proposal.startTime} + reviewDuration ${proposal.reviewDuration})`)
  console.log(`  [2] votingEnd:       ${votingEnd} (= votingStart + votingDuration ${proposal.votingDuration}, emergency=${proposal.emergency})`)
  console.log(`  [2] halfDuration:    ${halfDuration} (= votingDuration / 2)`)

  const txTimestamp = votingStart + scenario.castAtOffsetFromVotingStart
  const elapsedFromStart = txTimestamp - votingStart
  console.log(`  [3] txTimestamp:     ${txTimestamp} (= votingStart + offset ${scenario.castAtOffsetFromVotingStart})`)
  console.log(`  [3] elapsedFromStart: ${elapsedFromStart}s`)

  const timeMultiplier = getTimeMultiplier(txTimestamp, votingStart, votingEnd, halfDuration)
  if (halfDuration === 0) {
    console.log(`  [4] timeMultiplier:  ${timeMultiplier.toString()} (halfDuration=0 → 1)`)
  } else if (elapsedFromStart <= halfDuration) {
    console.log(`  [4] timeMultiplier:  ${timeMultiplier.toString()} (first half: elapsed ${elapsedFromStart} <= ${halfDuration} → 1)`)
  } else {
    const timeLeft = votingEnd - txTimestamp
    console.log(`  [4] timeMultiplier:  ${timeMultiplier.toString()} (= max(0, (votingEnd - txTimestamp) / halfDuration) = max(0, ${timeLeft} / ${halfDuration}))`)
  }

  const spendWei = libToWei(scenario.spendLib)
  console.log(`  [5] spendWei:        ${formatWei(spendWei)}`)

  console.log(`  [6] weights[]:       [${scenario.weights.join(', ')}]`)

  const voteWeightInput = {
    spend: spendWei,
    minimumSpendWei,
    voteExponent: proposal.voteExponent,
    weights: scenario.weights,
    timeMultiplier,
  }
  const { totalSelectionWeight, spendInLIB, spendBoost, baseWeight } = calculateVoteWeightDetails(voteWeightInput)
  console.log(`  [6] totalSelectionWeight: ${totalSelectionWeight}`)
  console.log(`  [7] spendInLIB:      ${spendInLIB.toString()} (= spendWei / 1e18)`)
  console.log(`  [7] spendBoost:      ${spendBoost.toString()} (= (spendWei / minSpendWei)^${proposal.voteExponent})`)
  console.log(`  [7] baseWeight:      ${baseWeight.toString()} (= spendInLIB * spendBoost * timeMultiplier * WEIGHT_PRECISION / totalSelectionWeight)`)

  const optionWeights = calculateOptionWeights(voteWeightInput)
  for (let i = 0; i < scenario.weights.length; i++) {
    if (scenario.weights[i] <= 0) {
      console.log(`  [8] option[${i}]:        0 (weight ${scenario.weights[i]} <= 0, skipped)`)
    } else {
      const raw = baseWeight.times(scenario.weights[i])
      console.log(`  [8] option[${i}]:        ${optionWeights[i].toString()} (= floor(baseWeight * ${scenario.weights[i]}) = floor(${raw.toString()}))`)
    }
  }

  console.log(`  [9] optionWeights[]: [${optionWeights.map((w) => w.toString()).join(', ')}]`)
  console.log(`  [9] WEIGHT_PRECISION: ${WEIGHT_PRECISION.toString()}`)
}
