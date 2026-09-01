import { ethers } from 'ethers'
import { LiberdusFlags } from '../src/config'
import { exceedsMintThreshold, maxMintThresholdWei } from '../src/utils/daoProjectMint'

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
