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

/** True when no milestone remains that could still start or finish. */
export function allMilestonesFinished(project: DaoProjectData): boolean {
  return project.milestones.every((m) => m.status === 'completed' || m.status === 'terminated')
}
