import { ethers } from 'ethers'
import { LiberdusFlags } from '../src/config'
import { DaoMilestone } from '../src/@types'
import { exceedsMintThreshold, maxMintThresholdWei, projectMintAmountWei } from '../src/utils/daoProjectMint'

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
