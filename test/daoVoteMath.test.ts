import {
  DaoDecimal,
  getTimeMultiplier,
  calculateVoteWeightDetails,
  calculateOptionWeights,
} from '../src/utils/daoVoteMath'

const LIB = 10n ** 18n // 1 LIB in wei
const HOUR_MS = 3_600_000
const DAY_MS = 24 * HOUR_MS

// ─── getTimeMultiplier ────────────────────────────────────────────────────────

describe('getTimeMultiplier', () => {
  const votingStart = 0
  const votingEnd = 8 * DAY_MS
  const halfDuration = votingEnd / 2 // 4 days

  test('first half returns 1', () => {
    const result = getTimeMultiplier(1 * DAY_MS, votingStart, votingEnd, halfDuration)
    expect(result.toNumber()).toBe(1)
  })

  test('exactly at the halfway point returns 1', () => {
    const result = getTimeMultiplier(votingStart + halfDuration, votingStart, votingEnd, halfDuration)
    expect(result.toNumber()).toBe(1)
  })

  test('at three-quarters of the period returns 0.5', () => {
    // 6 days in: timeLeft = 2 days, halfDuration = 4 days → 2/4 = 0.5
    const result = getTimeMultiplier(6 * DAY_MS, votingStart, votingEnd, halfDuration)
    expect(result.toNumber()).toBeCloseTo(0.5)
  })

  test('at votingEnd returns 0', () => {
    const result = getTimeMultiplier(votingEnd, votingStart, votingEnd, halfDuration)
    expect(result.toNumber()).toBe(0)
  })

  test('past votingEnd is clamped to 0', () => {
    const result = getTimeMultiplier(votingEnd + DAY_MS, votingStart, votingEnd, halfDuration)
    expect(result.toNumber()).toBe(0)
  })

  test('halfDuration = 0 returns 1 (zero-duration guard)', () => {
    const result = getTimeMultiplier(DAY_MS, votingStart, votingEnd, 0)
    expect(result.toNumber()).toBe(1)
  })
})

// ─── calculateVoteWeightDetails ───────────────────────────────────────────────

describe('calculateVoteWeightDetails', () => {
  const minimumSpendWei = 1n * LIB      // 1 LIB minimum
  const voteExponent = 1.1
  const timeMultiplier = new DaoDecimal(1) // full weight (first half)

  test('spend equal to minimum gives spendBoost of 1', () => {
    const { spendBoost } = calculateVoteWeightDetails({
      spend: minimumSpendWei,
      minimumSpendWei,
      voteExponent,
      weights: [1],
      timeMultiplier,
    })
    expect(spendBoost.toNumber()).toBeCloseTo(1)
  })

  test('spend 10x minimum gives spendBoost of 10^1.1', () => {
    const { spendBoost } = calculateVoteWeightDetails({
      spend: 10n * LIB,
      minimumSpendWei,
      voteExponent,
      weights: [1],
      timeMultiplier,
    })
    expect(spendBoost.toNumber()).toBeCloseTo(Math.pow(10, 1.1))
  })

  test('spendInLIB converts wei to LIB correctly', () => {
    const { spendInLIB } = calculateVoteWeightDetails({
      spend: 5n * LIB,
      minimumSpendWei,
      voteExponent,
      weights: [1],
      timeMultiplier,
    })
    expect(spendInLIB.toNumber()).toBeCloseTo(5)
  })

  test('timeMultiplier = 0.5 halves the baseWeight compared to full weight', () => {
    const input = { spend: 5n * LIB, minimumSpendWei, voteExponent, weights: [1] }
    const { baseWeight: full } = calculateVoteWeightDetails({ ...input, timeMultiplier: new DaoDecimal(1) })
    const { baseWeight: half } = calculateVoteWeightDetails({ ...input, timeMultiplier: new DaoDecimal(0.5) })
    expect(half.toNumber()).toBeCloseTo(full.toNumber() / 2)
  })

  test('splitting weights [1,1] halves baseWeight vs [1] for the same spend', () => {
    const input = { spend: 5n * LIB, minimumSpendWei, voteExponent, timeMultiplier }
    const { baseWeight: single } = calculateVoteWeightDetails({ ...input, weights: [1] })
    const { baseWeight: split }  = calculateVoteWeightDetails({ ...input, weights: [1, 1] })
    // baseWeight is pre-divided by totalSelectionWeight: [1,1] sum=2 → half of [1] sum=1
    expect(split.toNumber()).toBeCloseTo(single.toNumber() / 2)
  })
})

// ─── calculateOptionWeights ───────────────────────────────────────────────────

describe('calculateOptionWeights', () => {
  const minimumSpendWei = 1n * LIB
  const voteExponent = 1.1
  const timeMultiplier = new DaoDecimal(1)
  const spend = 1n * LIB // exactly minimum → spendBoost = 1

  test('single option receives the full weight', () => {
    const [w] = calculateOptionWeights({ spend, minimumSpendWei, voteExponent, weights: [1], timeMultiplier })
    expect(w).toBeGreaterThan(0n)
  })

  test('zero-weight option stays 0', () => {
    const [yes, no] = calculateOptionWeights({
      spend, minimumSpendWei, voteExponent, weights: [1, 0], timeMultiplier,
    })
    expect(yes).toBeGreaterThan(0n)
    expect(no).toBe(0n)
  })

  test('equal weights produce equal option weights', () => {
    const [a, b] = calculateOptionWeights({
      spend, minimumSpendWei, voteExponent, weights: [1, 1], timeMultiplier,
    })
    expect(a).toBe(b)
  })

  test('weight [3, 1] gives option 0 three times option 1', () => {
    const [heavy, light] = calculateOptionWeights({
      spend, minimumSpendWei, voteExponent, weights: [3, 1], timeMultiplier,
    })
    expect(heavy).toBe(light * 3n)
  })

  test('returns an array of the same length as weights input', () => {
    const result = calculateOptionWeights({
      spend, minimumSpendWei, voteExponent, weights: [1, 2, 3, 4], timeMultiplier,
    })
    expect(result).toHaveLength(4)
  })

  test('all results are non-negative bigints', () => {
    const results = calculateOptionWeights({
      spend, minimumSpendWei, voteExponent, weights: [5, 3, 0, 2], timeMultiplier,
    })
    for (const w of results) {
      expect(w).toBeGreaterThanOrEqual(0n)
    }
  })

  test('higher spend produces proportionally higher weights', () => {
    const base   = calculateOptionWeights({ spend: 1n * LIB,  minimumSpendWei, voteExponent, weights: [1], timeMultiplier })
    const double = calculateOptionWeights({ spend: 2n * LIB,  minimumSpendWei, voteExponent, weights: [1], timeMultiplier })
    // spendBoost = (2/1)^1.1 > 2, and spendInLIB doubles → weight more than doubles
    expect(double[0]).toBeGreaterThan(base[0] * 2n)
  })
})
