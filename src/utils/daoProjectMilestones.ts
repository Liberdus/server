import { ethers } from 'ethers'
import { DaoMilestone } from '../@types'

/**
 * Creation-time bounds on a project proposal.
 *
 * These exist because the proposer chooses the size of a consensus-visible account that is then
 * rewritten and re-hashed by every subsequent project transaction. Without them one proposal can
 * make every later transaction on it expensive. Hard-coded rather than configurable, matching the
 * title/description limits already inline in dao_proposal_create.
 */
export const MAX_PROJECT_MILESTONES = 20
export const MAX_MILESTONE_TITLE_LENGTH = 100
export const MAX_MILESTONE_TEXT_LENGTH = 2000

/** Rejects anything ethers.parseEther would throw on, plus negatives. */
function usdStrError(value: unknown, field: string, path: string): string | undefined {
  if (typeof value !== 'string' || value.length === 0) {
    return `${path}.${field} must be a non-empty USD string`
  }
  let parsed: bigint
  try {
    parsed = ethers.parseEther(value)
  } catch {
    return `${path}.${field} ("${value}") is not a valid decimal USD string`
  }
  if (parsed < 0n) return `${path}.${field} ("${value}") must not be negative`
  return undefined
}

/**
 * Validates the milestone array supplied at proposal creation.
 *
 * Only the proposer-supplied milestone fields are checked. Everything else on DaoProjectData —
 * balance, rate, times, endorsements, logs — is written by the network as the project runs. The
 * contractor address is validated by the caller, which keeps this module free of the utils barrel
 * and the config/utils import cycle that comes with it.
 */
export function validateProjectMilestones(milestones: unknown): string | undefined {
  if (!Array.isArray(milestones) || milestones.length === 0) {
    return 'tx "project.milestones" must be a non-empty array'
  }
  if (milestones.length > MAX_PROJECT_MILESTONES) {
    return `tx "project.milestones" has ${milestones.length} entries, exceeding the maximum of ${MAX_PROJECT_MILESTONES}`
  }

  for (const [i, entry] of milestones.entries()) {
    const path = `project.milestones[${i}]`
    if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) {
      return `${path} must be an object`
    }
    const m = entry as Partial<DaoMilestone>

    if (typeof m.title !== 'string' || m.title.trim().length === 0 || m.title.length > MAX_MILESTONE_TITLE_LENGTH) {
      return `${path}.title must be a non-empty string of at most ${MAX_MILESTONE_TITLE_LENGTH} characters`
    }
    for (const field of ['description', 'deliverable'] as const) {
      const text = m[field]
      if (typeof text !== 'string' || text.trim().length === 0 || text.length > MAX_MILESTONE_TEXT_LENGTH) {
        return `${path}.${field} must be a non-empty string of at most ${MAX_MILESTONE_TEXT_LENGTH} characters`
      }
    }
    // A zero or non-finite duration would make the bonus/penalty comparison meaningless — every
    // milestone would be judged instantly late or produce NaN.
    if (typeof m.duration !== 'number' || !Number.isFinite(m.duration) || m.duration <= 0) {
      return `${path}.duration must be a positive finite number of milliseconds`
    }
    for (const field of ['costUsdStr', 'penaltyUsdStr', 'bonusUsdStr'] as const) {
      const error = usdStrError(m[field], field, path)
      if (error) return error
    }
  }

  return undefined
}
