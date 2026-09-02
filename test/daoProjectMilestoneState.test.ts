import { DaoProjectData } from '../src/@types'
import { allMilestonesFinished, canStartMilestone, findExecutingMilestone, findNextPendingMilestone, resolveMilestone } from '../src/utils/daoProjectMilestoneState'

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

describe('findNextPendingMilestone', () => {
  test('is the first pending milestone, not merely the first unfinished one', () => {
    expect(findNextPendingMilestone(project('completed', 'pending', 'pending')).index).toBe(1)
  })

  test('skips past finished milestones of either kind', () => {
    expect(findNextPendingMilestone(project('completed', 'terminated', 'pending')).index).toBe(2)
  })

  test('errors rather than returning a milestone when none is pending', () => {
    expect(findNextPendingMilestone(project('completed', 'executing')).error).toMatch('No milestone is pending')
  })

  test('an executing milestone shifts the target, and canStartMilestone then rejects it', () => {
    // This is the retargeting window: once milestone 1 starts, milestone 2 becomes the derived
    // target. What makes it safe is not that the target holds still, but that the order check
    // refuses a milestone whose predecessor is merely executing rather than finished.
    const p = project('executing', 'pending')
    const next = findNextPendingMilestone(p)
    expect(next.index).toBe(1)
    expect(canStartMilestone(p, next.index)).toMatch('still executing')
  })
})

describe('findExecutingMilestone', () => {
  test('is the executing milestone', () => {
    expect(findExecutingMilestone(project('completed', 'executing', 'pending')).index).toBe(1)
  })

  test('errors when nothing is executing', () => {
    expect(findExecutingMilestone(project('completed', 'pending')).error).toMatch('nothing to end')
  })

  test('only one milestone can be executing, so the derivation is unambiguous', () => {
    // Guaranteed by canStartMilestone, which will not start a milestone while an earlier one is
    // unfinished. Asserted here so the invariant this derivation rests on is written down.
    const p = project('executing', 'pending')
    expect(canStartMilestone(p, 1)).toBeDefined()
  })
})
