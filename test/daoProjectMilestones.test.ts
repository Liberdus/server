import { validateDaoOptions } from '../src/utils/daoBallotOptions'
import { MAX_MILESTONE_TEXT_LENGTH, MAX_MILESTONE_TITLE_LENGTH, MAX_PROJECT_MILESTONES, validateProjectMilestones } from '../src/utils/daoProjectMilestones'

function milestone(over: Record<string, unknown> = {}): unknown {
  return {
    title: 'Deliver the thing',
    description: 'Build it',
    deliverable: 'A working thing',
    duration: 86_400_000,
    costUsdStr: '1000',
    penaltyUsdStr: '100',
    bonusUsdStr: '50',
    ...over,
  }
}

describe('validateProjectMilestones', () => {
  test('accepts a well-formed milestone array', () => {
    expect(validateProjectMilestones([milestone(), milestone()])).toBeUndefined()
  })

  test('rejects an empty or non-array milestones field', () => {
    expect(validateProjectMilestones([])).toMatch('non-empty array')
    expect(validateProjectMilestones(undefined)).toMatch('non-empty array')
    expect(validateProjectMilestones('milestones')).toMatch('non-empty array')
  })

  test('caps the milestone count', () => {
    // The proposer picks the size of an account that every later project tx rewrites and re-hashes.
    const atLimit = Array.from({ length: MAX_PROJECT_MILESTONES }, () => milestone())
    expect(validateProjectMilestones(atLimit)).toBeUndefined()
    expect(validateProjectMilestones([...atLimit, milestone()])).toMatch('exceeding the maximum')
  })

  test('rejects a non-object entry', () => {
    expect(validateProjectMilestones([null])).toMatch('must be an object')
    expect(validateProjectMilestones([['a']])).toMatch('must be an object')
  })

  test('bounds the text fields, and rejects whitespace-only', () => {
    expect(validateProjectMilestones([milestone({ title: '' })])).toMatch('title')
    expect(validateProjectMilestones([milestone({ title: '   ' })])).toMatch('title')
    expect(validateProjectMilestones([milestone({ title: 'x'.repeat(MAX_MILESTONE_TITLE_LENGTH + 1) })])).toMatch('title')
    expect(validateProjectMilestones([milestone({ description: 'x'.repeat(MAX_MILESTONE_TEXT_LENGTH + 1) })])).toMatch('description')
    expect(validateProjectMilestones([milestone({ deliverable: '' })])).toMatch('deliverable')
  })

  test('requires a positive finite duration', () => {
    // Zero or NaN would make the bonus/penalty comparison meaningless rather than merely odd.
    for (const duration of [0, -1, NaN, Infinity, '86400000']) {
      expect(validateProjectMilestones([milestone({ duration })])).toMatch('positive finite number')
    }
  })

  test('requires parseable non-negative USD strings', () => {
    expect(validateProjectMilestones([milestone({ costUsdStr: 'abc' })])).toMatch('not a valid decimal USD string')
    expect(validateProjectMilestones([milestone({ bonusUsdStr: '' })])).toMatch('non-empty USD string')
    expect(validateProjectMilestones([milestone({ penaltyUsdStr: 1000 })])).toMatch('non-empty USD string')
    expect(validateProjectMilestones([milestone({ costUsdStr: '-5' })])).toMatch('must not be negative')
  })

  test('zero cost, penalty and bonus are allowed', () => {
    // A milestone with no payment is unusual but not malformed — it may exist purely as a checkpoint.
    expect(validateProjectMilestones([milestone({ costUsdStr: '0', penaltyUsdStr: '0', bonusUsdStr: '0' })])).toBeUndefined()
  })

  test('reports the index of the offending milestone', () => {
    const error = validateProjectMilestones([milestone(), milestone({ duration: 0 })])
    expect(error).toMatch('milestones[1]')
  })
})

describe('validateDaoOptions for project proposals', () => {
  test('accepts exactly two options', () => {
    expect(validateDaoOptions(['no', 'yes'], 'project')).toBeUndefined()
    expect(validateDaoOptions(['no', 'fund the build'], 'project')).toBeUndefined()
  })

  test('rejects three or more options for a project', () => {
    // A project has one flat milestone array, so a third option would select nothing.
    expect(validateDaoOptions(['no', 'a', 'b'], 'project')).toMatch('exactly 2 entries')
  })

  test('leaves other proposal types multi-option', () => {
    expect(validateDaoOptions(['no', 'a', 'b'], 'governance')).toBeUndefined()
    expect(validateDaoOptions(['no', 'a', 'b'])).toBeUndefined()
  })

  test('still enforces the negative-first rule for projects', () => {
    expect(validateDaoOptions(['yes', 'no'], 'project')).toMatch('rejection choice')
  })
})
