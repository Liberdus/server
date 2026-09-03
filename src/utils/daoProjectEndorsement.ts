/**
 * Committee agreements needed before a proposed value commits.
 *
 * The proposer always counts as the first, so this is a total, not a number of *additional*
 * endorsers. Read the policy's rules that way and they already agree: "endorsed by two committee
 * members" after a proposer set the value, "two more committee members" for an address change, and
 * "once three committee members submit" for a termination all come to three.
 */
export const PROJECT_ENDORSEMENT_THRESHOLD = 3

/**
 * How many endorsements are actually required, given who may endorse this particular value.
 *
 * The clamp exists so a committee smaller than the threshold cannot deadlock — but the reachable
 * maximum differs by path, so a single clamp to committee size would be wrong. On the paths the
 * contractor may open, the contractor occupies index 0 and the committee supplies the rest, so the
 * ceiling is `1 + committeeSize`. Clamping those to `committeeSize` would commit a milestone one
 * endorsement early whenever the committee is small.
 */
export function requiredEndorsements(committeeSize: number, contractorMayPropose: boolean): number {
  const reachable = contractorMayPropose ? committeeSize + 1 : committeeSize
  return Math.min(PROJECT_ENDORSEMENT_THRESHOLD, Math.max(reachable, 1))
}

export interface EndorsementCheck {
  error?: string
  /** True once the endorsement list has reached the required count and the value should commit. */
  committed?: boolean
}

/**
 * Write-once: rejects a second proposal for a value that already has one pending.
 *
 * Milestone paths only. A pending time that cannot be replaced is what stops an endorsement counting
 * toward a time its sender never saw, and it enforces the policy's "the contractor can only call
 * this once" — applyEndorsement's contractor check blocks endorsing but not re-proposing, and every
 * proposal resets the count.
 *
 * Safe on a milestone because a bad value still has an escape: terminate accepts a `pending` one.
 * The address path has none — `proposedAddress` is cleared only on commit, so this would freeze the
 * contractor address for the life of the project, and changing it is the remedy for a lost key.
 */
export function writeOnceError(hasPendingValue: boolean, isProposingNewValue: boolean): string | undefined {
  if (isProposingNewValue && hasPendingValue) return 'A value has already been proposed; it can only be endorsed'
  return undefined
}

/**
 * Applies one propose-or-endorse submission to an endorsement list, in place.
 *
 * A submission carrying a value replaces whatever was pending and re-seeds the endorsements with its
 * sender; one without endorses what is pending. Whether a second proposal is allowed at all is the
 * caller's decision — see writeOnceError.
 *
 * `endorsements` is mutated. Prefer the plan* functions below, which decide without mutating.
 */
export function applyEndorsement(
  endorsements: string[],
  sender: string,
  isProposingNewValue: boolean,
  committeeAddresses: string[],
  contractorAddress: string | undefined,
  hasPendingValue: boolean,
): EndorsementCheck {
  const isCommittee = committeeAddresses.includes(sender)
  const isContractor = contractorAddress !== undefined && sender === contractorAddress
  const contractorMayPropose = contractorAddress !== undefined

  if (!isCommittee && !isContractor) {
    return { error: 'Only a committee member or the contractor may submit this transaction' }
  }
  // Letting the contractor endorse would let them occupy two of the three slots.
  if (isContractor && !isCommittee && !isProposingNewValue) {
    return { error: 'The contractor may propose a value but not endorse one' }
  }

  if (isProposingNewValue) {
    // Replace rather than append: a new value is a different question, so endorsements collected
    // for the old one must not carry over.
    endorsements.length = 0
    endorsements.push(sender)
  } else {
    if (!hasPendingValue) {
      return { error: 'There is no proposed value to endorse' }
    }
    if (endorsements.includes(sender)) {
      return { error: 'This address has already endorsed the proposed value' }
    }
    endorsements.push(sender)
  }

  const required = requiredEndorsements(committeeAddresses.length, contractorMayPropose)
  return { committed: endorsements.length >= required }
}

export interface EndorsementPlan {
  error?: string
  isProposing: boolean
  committed: boolean
  /** Replaces the endorsement list wholesale. A fresh array, never the one that was read. */
  nextEndorsements: string[]
}

export interface MilestoneTimePlan extends EndorsementPlan {
  nextProposedTime?: number
}

export interface AddressPlan extends EndorsementPlan {
  nextProposedAddress?: string
}

/**
 * Decides what a milestone start or end submission does, without changing anything.
 *
 * Reads the pending time and endorsement list itself and returns what should replace them. It takes
 * no "is something pending" flag on purpose: a caller that computed one *after* writing
 * `proposedTime` turned every opening proposal into a rejected re-proposal, and since validate() and
 * apply() built those arguments separately, only a live network caught it.
 *
 * Milestone times are write-once and the contractor may open one — addresses differ on both counts.
 */
export function planMilestoneTimeEndorsement(
  tx: { from: string; proposedTime?: number },
  committeeAddresses: string[],
  contractorAddress: string | undefined,
  milestone: { proposedTime?: number; endorsedTime: string[] },
): MilestoneTimePlan {
  const isProposing = tx.proposedTime !== undefined
  const hasPendingValue = milestone.proposedTime !== undefined
  const nextEndorsements = [...milestone.endorsedTime]

  const writeOnce = writeOnceError(hasPendingValue, isProposing)
  if (writeOnce) return { error: writeOnce, isProposing, committed: false, nextEndorsements }

  const result = applyEndorsement(nextEndorsements, tx.from, isProposing, committeeAddresses, contractorAddress, hasPendingValue)
  if (result.error) return { error: result.error, isProposing, committed: false, nextEndorsements }

  return {
    isProposing,
    committed: result.committed === true,
    nextProposedTime: isProposing ? tx.proposedTime : milestone.proposedTime,
    nextEndorsements,
  }
}

/**
 * The same for a contractor address change, differing on both policy points.
 *
 * No write-once, per policy line 353: refusing a second proposal would freeze the contractor address
 * for the life of the project, and changing it is the remedy for a lost key.
 *
 * No contractor slot: the committee alone decides who replaces them, so the threshold clamps to the
 * committee size.
 */
export function planAddressEndorsement(
  tx: { from: string; proposedAddress?: string },
  committeeAddresses: string[],
  project: { proposedAddress?: string; endorsedAddress: string[] },
): AddressPlan {
  const isProposing = tx.proposedAddress !== undefined
  const hasPendingValue = project.proposedAddress !== undefined
  const nextEndorsements = [...project.endorsedAddress]

  const result = applyEndorsement(nextEndorsements, tx.from, isProposing, committeeAddresses, undefined, hasPendingValue)
  if (result.error) return { error: result.error, isProposing, committed: false, nextEndorsements }

  return {
    isProposing,
    committed: result.committed === true,
    nextProposedAddress: isProposing ? tx.proposedAddress : project.proposedAddress,
    nextEndorsements,
  }
}
