import { ethers } from 'ethers'
import { LiberdusFlags } from '../src/config'
import { DaoMilestone } from '../src/@types'
import { degenerateMilestoneAtRate, exceedsMintThreshold, maxMintThresholdWei, projectMintAmountWei } from '../src/utils/daoProjectMint'

const original = LiberdusFlags.daoMaxMintThresholdLibStr

afterEach(() => {
  LiberdusFlags.daoMaxMintThresholdLibStr = original
})

describe('maxMintThresholdWei', () => {
  test('parses the configured LIB string exactly', () => {
    LiberdusFlags.daoMaxMintThresholdLibStr = '1000000'
    expect(maxMintThresholdWei()).toBe(ethers.parseEther('1000000'))
  })

  test('keeps full precision on fractional values', () => {
    // Parsing the decimal string directly avoids the float rounding a Number would introduce.
    LiberdusFlags.daoMaxMintThresholdLibStr = '0.000000000000000001'
    expect(maxMintThresholdWei()).toBe(1n)
  })

  test('throws on a malformed value rather than falling back', () => {
    // A ceiling that silently becomes something other than what was configured is worse than a
    // failed transaction, so this must not default.
    LiberdusFlags.daoMaxMintThresholdLibStr = 'not-a-number'
    expect(() => maxMintThresholdWei()).toThrow('not a valid decimal LIB string')
  })

  test('throws on a negative value', () => {
    LiberdusFlags.daoMaxMintThresholdLibStr = '-1'
    expect(() => maxMintThresholdWei()).toThrow('must not be negative')
  })

  test('zero is valid and blocks every mint', () => {
    // A deliberate kill switch, distinct from a malformed value.
    LiberdusFlags.daoMaxMintThresholdLibStr = '0'
    expect(maxMintThresholdWei()).toBe(0n)
    expect(exceedsMintThreshold(1n)).toBe(true)
    expect(exceedsMintThreshold(0n)).toBe(false)
  })
})

describe('exceedsMintThreshold', () => {
  test('is strictly greater — a mint exactly at the ceiling is allowed', () => {
    LiberdusFlags.daoMaxMintThresholdLibStr = '100'
    const ceiling = ethers.parseEther('100')
    expect(exceedsMintThreshold(ceiling - 1n)).toBe(false)
    expect(exceedsMintThreshold(ceiling)).toBe(false)
    expect(exceedsMintThreshold(ceiling + 1n)).toBe(true)
  })

  test('tracks a runtime change to the flag', () => {
    // The flag is settable via /debug-set-liberdus-flag, so the value is read per call rather
    // than captured at module load.
    LiberdusFlags.daoMaxMintThresholdLibStr = '10'
    expect(exceedsMintThreshold(ethers.parseEther('50'))).toBe(true)
    LiberdusFlags.daoMaxMintThresholdLibStr = '100'
    expect(exceedsMintThreshold(ethers.parseEther('50'))).toBe(false)
  })
})

describe('projectMintAmountWei', () => {
  // Stand-in for utils.usdStrToWei at a 1:1 rate, so the arithmetic under test is the summing.
  const toWei = (usdStr: string): bigint => ethers.parseEther(usdStr)

  function milestone(costUsdStr: string, bonusUsdStr: string, penaltyUsdStr = '0'): DaoMilestone {
    return { costUsdStr, bonusUsdStr, penaltyUsdStr } as DaoMilestone
  }

  test('sums cost plus bonus across milestones', () => {
    const total = projectMintAmountWei([milestone('100', '10'), milestone('200', '20')], toWei)
    expect(total).toBe(ethers.parseEther('330'))
  })

  test('excludes penalties', () => {
    // A penalty only ever reduces what a contractor is paid. Folding it in would inflate the escrow
    // and mint more than the project can legitimately pay out.
    const withPenalty = projectMintAmountWei([milestone('100', '10', '999')], toWei)
    expect(withPenalty).toBe(ethers.parseEther('110'))
  })

  test('is zero for milestones that pay nothing', () => {
    expect(projectMintAmountWei([milestone('0', '0')], toWei)).toBe(0n)
  })

  test('propagates a malformed amount rather than silently skipping it', () => {
    // Never mint on a total we could not compute.
    expect(() => projectMintAmountWei([milestone('abc', '0')], toWei)).toThrow()
  })
})

describe('degenerateMilestoneAtRate', () => {
  function milestone(costUsdStr: string, penaltyUsdStr: string): DaoMilestone {
    return { costUsdStr, penaltyUsdStr, bonusUsdStr: '0' } as DaoMilestone
  }

  // Converts USD to wei the way the handler does: parseEther(usd) * 1e18 / parseEther(rate),
  // one truncating division per amount, which is where distinct USD values can collapse together.
  const atRate =
    (rateUsdStr: string) =>
    (usdStr: string): bigint =>
      (ethers.parseEther(usdStr) * 10n ** 18n) / ethers.parseEther(rateUsdStr)

  test('accepts milestones that convert to distinct wei values', () => {
    expect(degenerateMilestoneAtRate([milestone('1000', '100')], atRate('1'))).toBeUndefined()
  })

  test('rejects a pair that is valid in USD but collapses to the same wei value', () => {
    // The case the creation-time rule cannot see: penalty < cost as decimal strings, yet both
    // truncate to zero once divided by a large rate.
    const milestones = [milestone('0.000000000000000002', '0.000000000000000001')]
    expect(degenerateMilestoneAtRate(milestones, atRate('1'))).toBeUndefined()
    expect(degenerateMilestoneAtRate(milestones, atRate('1000000'))).toMatch('zero payout')
  })

  test('rejects when both amounts truncate to zero', () => {
    const error = degenerateMilestoneAtRate([milestone('0.000000000000000001', '0.000000000000000001')], atRate('1000000'))
    expect(error).toMatch('0 wei')
  })

  test('names the offending milestone index', () => {
    const milestones = [milestone('1000', '100'), milestone('10', '20')]
    expect(degenerateMilestoneAtRate(milestones, atRate('1'))).toMatch('milestones[1]')
  })

  test('propagates a malformed amount rather than passing the milestone', () => {
    expect(() => degenerateMilestoneAtRate([milestone('abc', '1')], atRate('1'))).toThrow()
  })
})
