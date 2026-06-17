import { computeClaimReward } from '../src/utils/daoClaimRewardMath'

const LIB = 10n ** 18n // 1 LIB in wei
const HOUR_MS = 3_600_000n
const DAY_MS = 24n * HOUR_MS

describe('computeClaimReward', () => {
  // Shared pool used across most tests: 100 LIB post-initial-burn reward pool
  const pool = 100n * LIB
  const votingDuration = 8n * DAY_MS // 8 days in ms

  // ─── timeDelta = 0 ──────────────────────────────────────────────────────────

  test('timeDelta = 0 still pays the equal share', () => {
    // timePart = 0; only equalPart contributes
    // reward = pool * (0 + PRECISION/1) / (2 * PRECISION) = pool / 2
    const reward = computeClaimReward(pool, 0n, votingDuration, 1n)
    expect(reward).toBe(pool / 2n)
  })

  // ─── single voter ────────────────────────────────────────────────────────────

  test('single voter with full-period timeDelta receives the full pool', () => {
    // timeDelta = votingDuration → timePart = PRECISION
    // equalPart = PRECISION / 1 = PRECISION (1 voter)
    // reward = pool * (PRECISION + PRECISION) / (2 * PRECISION) = pool
    const reward = computeClaimReward(pool, votingDuration, votingDuration, 1n)
    expect(reward).toBe(pool)
  })

  test('single voter with timeDelta = 0 gets half the pool', () => {
    const reward = computeClaimReward(pool, 0n, votingDuration, 1n)
    expect(reward).toBe(pool / 2n)
  })

  // ─── two voters, equal time split ────────────────────────────────────────────

  test('two voters with equal time gaps each get exactly half the pool', () => {
    // voter1: timeDelta = votingDuration/2, voterCount = 2
    // timePart = PRECISION/2, equalPart = PRECISION/2
    // reward = pool * (PRECISION/2 + PRECISION/2) / 2*PRECISION = pool/2
    const halfDuration = votingDuration / 2n
    const PRECISION = 10n ** 18n

    const timePart1 = (halfDuration * PRECISION) / votingDuration  // PRECISION/2
    const equalPart = PRECISION / 2n                                // PRECISION/2
    const expected1 = pool * (timePart1 + equalPart) / (2n * PRECISION)

    const reward1 = computeClaimReward(pool, halfDuration, votingDuration, 2n)
    const reward2 = computeClaimReward(pool, halfDuration, votingDuration, 2n)

    expect(reward1).toBe(expected1)
    expect(reward1).toBe(reward2) // symmetric — same timeDelta, same voterCount
  })

  // ─── first vs last voter ─────────────────────────────────────────────────────

  test('first voter (large timeDelta) earns more than last voter (small timeDelta)', () => {
    // 3 voters: first claims 7 days of the 8-day period, last claims 1 day
    const firstDelta = 7n * DAY_MS
    const lastDelta  = 1n * DAY_MS

    const firstReward = computeClaimReward(pool, firstDelta, votingDuration, 3n)
    const lastReward  = computeClaimReward(pool, lastDelta,  votingDuration, 3n)

    expect(firstReward).toBeGreaterThan(lastReward)
  })

  test('all voters together do not exceed the pool', () => {
    // 4 voters whose timeDelta adds up to exactly votingDuration
    const deltas = [2n * DAY_MS, 2n * DAY_MS, 2n * DAY_MS, 2n * DAY_MS]
    const voterCount = BigInt(deltas.length)
    let total = 0n
    for (const delta of deltas) {
      total += computeClaimReward(pool, delta, votingDuration, voterCount)
    }
    expect(total).toBeLessThanOrEqual(pool)
  })

  // ─── exact formula check ─────────────────────────────────────────────────────

  test('exact formula output matches hand-computed value', () => {
    // pool=100 LIB, timeDelta=2 days, votingDuration=8 days, voterCount=4
    // timePart  = (2/8) * PRECISION = PRECISION/4
    // equalPart = PRECISION/4
    // reward    = 100 LIB * (PRECISION/4 + PRECISION/4) / (2*PRECISION)
    //           = 100 LIB * PRECISION/2 / (2*PRECISION)
    //           = 100 LIB / 4 = 25 LIB
    const PRECISION = 10n ** 18n
    const timeDelta = 2n * DAY_MS
    const timePart  = (timeDelta * PRECISION) / votingDuration // PRECISION/4
    const equalPart = PRECISION / 4n                           // PRECISION/4
    const expected  = pool * (timePart + equalPart) / (2n * PRECISION)

    const reward = computeClaimReward(pool, timeDelta, votingDuration, 4n)
    expect(reward).toBe(expected)
    expect(reward).toBe(25n * LIB)
  })

  // ─── rounding ────────────────────────────────────────────────────────────────

  test('returns 0 for a zero pool', () => {
    expect(computeClaimReward(0n, DAY_MS, votingDuration, 2n)).toBe(0n)
  })

  test('result is always a non-negative bigint', () => {
    const reward = computeClaimReward(pool, 0n, votingDuration, 100n)
    expect(reward).toBeGreaterThanOrEqual(0n)
  })

  test('sum of many small-timeDelta voters does not overflow the pool', () => {
    // 100 voters each with timeDelta = 0 (worst case for equal share dominating)
    const voterCount = 100n
    let total = 0n
    for (let i = 0; i < 100; i++) {
      total += computeClaimReward(pool, 0n, votingDuration, voterCount)
    }
    expect(total).toBeLessThanOrEqual(pool)
  })
})
