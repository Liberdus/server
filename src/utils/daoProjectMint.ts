import { ethers } from 'ethers'
import { LiberdusFlags } from '../config'
import { DaoMilestone } from '../@types'

/**
 * The configured per-project mint ceiling, in wei.
 *
 * Parsed rather than stored as a bigint so the flag stays JSON-safe on /debug-liberdus-flags and
 * settable through the debug endpoint. Parsing is exact — no float rounding — because
 * ethers.parseEther works on the decimal string directly.
 *
 * Throws on a malformed value rather than falling back to a default: a mint ceiling that silently
 * becomes something other than what an operator configured is worse than a failed transaction. The
 * throw surfaces inside transaction validation, so a bad value stops mints instead of widening them.
 */
export function maxMintThresholdWei(): bigint {
  const configured = LiberdusFlags.daoMaxMintThresholdLibStr
  let parsed: bigint
  try {
    parsed = ethers.parseEther(configured)
  } catch {
    throw new Error(`daoMaxMintThresholdLibStr ("${configured}") is not a valid decimal LIB string`)
  }
  if (parsed < 0n) {
    throw new Error(`daoMaxMintThresholdLibStr ("${configured}") must not be negative`)
  }
  return parsed
}

/** True when minting `amountWei` would exceed the ceiling. Strictly greater — equality is allowed. */
export function exceedsMintThreshold(amountWei: bigint): boolean {
  return amountWei > maxMintThresholdWei()
}

/**
 * The most a project could ever owe: every milestone's cost plus its early-delivery bonus.
 *
 * Penalties are deliberately excluded. A penalty only ever reduces what a contractor is paid, so
 * folding it in here would inflate the escrow and mint more than the project can legitimately pay
 * out. The policy's phrase "including early bonuses" means exactly this sum.
 *
 * The USD-to-wei converter is injected rather than imported so this module stays clear of the utils
 * barrel, which drags in the config/utils import cycle.
 */
export function projectMintAmountWei(milestones: DaoMilestone[], usdStrToWei: (usdStr: string) => bigint): bigint {
  return milestones.reduce((total, m) => total + usdStrToWei(m.costUsdStr) + usdStrToWei(m.bonusUsdStr), 0n)
}
