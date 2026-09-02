import { DaoMilestone, DaoProjectData } from '../@types'

/**
 * Resolves a transaction's 1-based milestone number to its array index.
 *
 * Transactions number milestones from 1 to match how proposals are already addressed externally
 * ("dao proposal #N"); storage is a zero-indexed array. An off-by-one here misroutes a payment, so
 * both boundaries are rejected explicitly rather than left to produce `undefined`.
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
 * Milestones run strictly in order: a milestone may only start once every earlier one has finished,
 * one way or the other. The policy states it as "the previous milestone should be in the completed
 * or terminated state or this must be the first milestone in pending status".
 *
 * Checking every earlier milestone rather than only the immediately preceding one costs nothing and
 * closes the case where an earlier milestone was somehow left pending.
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
 * The policy says "start the next milestone" rather than naming one, so the sender does not supply
 * a number. A pure function of the project data, so every node derives the same milestone.
 *
 * `canStartMilestone` still runs at the call site: this only says which milestone is next in line,
 * not that it may start yet.
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
 * At most one can be, because a milestone cannot start while an earlier one is unfinished, so
 * "the current milestone" resolves unambiguously without the sender naming it.
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
