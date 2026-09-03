import { DaoMilestone, DaoProjectData } from '../@types'

/**
 * Resolves a transaction's 1-based milestone number to its array index.
 *
 * Transactions number from 1 to match how proposals are addressed externally; storage is 0-indexed.
 * An off-by-one here misroutes a payment, so both boundaries are rejected explicitly rather than
 * left to produce `undefined`.
 */
export function resolveMilestone(project: DaoProjectData, milestoneNumber: unknown): { milestone?: DaoMilestone; index?: number; error?: string } {
  if (typeof milestoneNumber !== 'number' || !Number.isInteger(milestoneNumber)) {
    return { error: 'tx "milestoneNumber" must be an integer' }
  }
  if (milestoneNumber < 1 || milestoneNumber > project.milestones.length) {
    return { error: `tx "milestoneNumber" (${milestoneNumber}) is outside the range 1..${project.milestones.length}` }
  }
  const index = milestoneNumber - 1
  return { milestone: project.milestones[index], index }
}

/**
 * Milestones run strictly in order: one may only start once every earlier one has finished, either
 * completed or terminated. Checking all of them rather than just the previous one costs nothing.
 *
 * Runs after findNextPendingMilestone and catches what that cannot: the next `pending` milestone may
 * still sit behind one that is `executing`. That rejection is what makes deriving the milestone
 * safe, so do not drop it as redundant.
 */
export function canStartMilestone(project: DaoProjectData, index: number): string | undefined {
  for (let i = 0; i < index; i++) {
    const previous = project.milestones[i]
    if (previous.status !== 'completed' && previous.status !== 'terminated') {
      return `Milestone ${i + 1} is still ${previous.status}; milestones run in order`
    }
  }
  return undefined
}

/**
 * The milestone a start transaction acts on: the first one still `pending`.
 *
 * The policy says "start the next milestone" rather than naming one, so the sender supplies no
 * number. A pure function of the project data, so every node derives the same milestone.
 *
 * This says which milestone is next in line, not that it may start — `canStartMilestone` still runs
 * at the call site, and rejects one whose predecessor is merely `executing`.
 */
export function findNextPendingMilestone(project: DaoProjectData): { milestone?: DaoMilestone; index?: number; error?: string } {
  const index = project.milestones.findIndex((m) => m.status === 'pending')
  if (index === -1) {
    return { error: 'No milestone is pending; every milestone has already started or finished' }
  }
  return { milestone: project.milestones[index], index }
}

/**
 * The milestone an end transaction acts on: the one currently `executing`.
 *
 * At most one can be, since a milestone cannot start while an earlier one is unfinished, so "the
 * current milestone" resolves without the sender naming it.
 */
export function findExecutingMilestone(project: DaoProjectData): { milestone?: DaoMilestone; index?: number; error?: string } {
  const executing = project.milestones.reduce<number[]>((found, m, i) => (m.status === 'executing' ? [...found, i] : found), [])
  if (executing.length === 0) {
    return { error: 'No milestone is executing; there is nothing to end' }
  }
  // Unreachable while canStartMilestone holds, but this is consensus code and "the current
  // milestone" has to mean one milestone. Failing closed beats silently ending the earliest of
  // several and writing a payout against it.
  if (executing.length > 1) {
    return { error: `Milestones ${executing.map((i) => i + 1).join(', ')} are all executing; cannot resolve the current one` }
  }
  return { milestone: project.milestones[executing[0]], index: executing[0] }
}

/** True when no milestone remains that could still start or finish. */
export function allMilestonesFinished(project: DaoProjectData): boolean {
  return project.milestones.every((m) => m.status === 'completed' || m.status === 'terminated')
}
