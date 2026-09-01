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
 * Applies one propose-or-endorse submission to an endorsement list, in place.
 *
 * The three project paths that need agreement — milestone start, milestone end, contractor address
 * — share this shape exactly: a submission carrying a value replaces whatever was pending and
 * re-seeds the endorsements with its sender; a submission without one endorses what is pending.
 *
 * `endorsements` is the live array and is mutated. Callers own the proposed value itself, because
 * its type differs per path (a timestamp or an address).
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
  // The contractor gets exactly one move: opening a proposal. Letting them endorse would let them
  // occupy two of the three slots, and letting them re-propose would let them reset the count every
  // time the committee got close to agreeing.
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
