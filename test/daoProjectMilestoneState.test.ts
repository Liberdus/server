import { DaoProjectData } from '../src/@types'
import { allMilestonesFinished, canStartMilestone, resolveMilestone } from '../src/utils/daoProjectMilestoneState'

function project(...statuses: string[]): DaoProjectData {
  return { milestones: statuses.map((status) => ({ status })) } as unknown as DaoProjectData
}

describe('resolveMilestone', () => {
  test('maps 1-based transaction numbers onto the 0-based array', () => {
    const p = project('pending', 'pending', 'pending')
    expect(resolveMilestone(p, 1).index).toBe(0)
    expect(resolveMilestone(p, 3).index).toBe(2)
  })

  test('rejects both boundaries rather than returning undefined', () => {
    // An off-by-one here misroutes a payment, so 0 and length + 1 are explicit rejections.
    const p = project('pending', 'pending')
    expect(resolveMilestone(p, 0).error).toMatch('outside the range')
    expect(resolveMilestone(p, 3).error).toMatch('outside the range')
  })

  test('rejects non-integers', () => {
    const p = project('pending')
    expect(resolveMilestone(p, 1.5).error).toMatch('must be an integer')
    expect(resolveMilestone(p, '1').error).toMatch('must be an integer')
    expect(resolveMilestone(p, undefined).error).toMatch('must be an integer')
  })
})

describe('canStartMilestone', () => {
  test('the first milestone can always start', () => {
    expect(canStartMilestone(project('pending', 'pending'), 0)).toBeUndefined()
  })

  test('a later milestone waits for every earlier one to finish', () => {
    expect(canStartMilestone(project('executing', 'pending'), 1)).toMatch('Milestone 1 is still executing')
    expect(canStartMilestone(project('pending', 'pending'), 1)).toMatch('Milestone 1 is still pending')
  })

  test('completed and terminated both count as finished', () => {
    expect(canStartMilestone(project('completed', 'pending'), 1)).toBeUndefined()
    expect(canStartMilestone(project('terminated', 'pending'), 1)).toBeUndefined()
  })

  test('checks every earlier milestone, not just the previous one', () => {
    // Closes the case where an earlier milestone was somehow left pending.
    expect(canStartMilestone(project('pending', 'completed', 'pending'), 2)).toMatch('Milestone 1')
  })
})

describe('allMilestonesFinished', () => {
  test('true only when nothing can still start or finish', () => {
    expect(allMilestonesFinished(project('completed', 'terminated'))).toBe(true)
    expect(allMilestonesFinished(project('completed', 'executing'))).toBe(false)
    expect(allMilestonesFinished(project('pending'))).toBe(false)
  })
})
