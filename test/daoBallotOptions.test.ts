import { isWinningOptionAccepted, validateDaoOptions } from '../src/utils/daoBallotOptions'

describe('dao ballot options', () => {
  test('negative-first binary ballots accept only option 1', () => {
    expect(validateDaoOptions(['no', 'yes'])).toBeUndefined()
    expect(isWinningOptionAccepted(['no', 'yes'], 0)).toBe(false)
    expect(isWinningOptionAccepted(['no', 'yes'], 1)).toBe(true)
  })

  test('negative-first synonyms are accepted', () => {
    expect(validateDaoOptions(['reject', 'accept'])).toBeUndefined()
    expect(isWinningOptionAccepted(['reject', 'accept'], 0)).toBe(false)
    expect(isWinningOptionAccepted(['reject', 'accept'], 1)).toBe(true)

    expect(validateDaoOptions(['deny', 'approve'])).toBeUndefined()
    expect(isWinningOptionAccepted(['deny', 'approve'], 0)).toBe(false)
    expect(isWinningOptionAccepted(['deny', 'approve'], 1)).toBe(true)
  })

  test('negative-first multi-option ballots accept only option 1', () => {
    expect(validateDaoOptions(['no', 'yes', 'abstain'])).toBeUndefined()
    expect(isWinningOptionAccepted(['no', 'yes', 'abstain'], 0)).toBe(false)
    expect(isWinningOptionAccepted(['no', 'yes', 'abstain'], 1)).toBe(true)
    expect(isWinningOptionAccepted(['no', 'yes', 'abstain'], 2)).toBe(false)
  })

  test('old affirmative-first ballots still resolve for in-flight proposals', () => {
    expect(validateDaoOptions(['yes', 'no'])).toContain('options[0]')
    expect(isWinningOptionAccepted(['yes', 'no'], 0)).toBe(true)
    expect(isWinningOptionAccepted(['yes', 'no'], 1)).toBe(false)
  })

  test('invalid new proposal option layouts are rejected', () => {
    expect(validateDaoOptions(['maybe', 'yes'])).toContain('options[0]')
    expect(validateDaoOptions(['no', 'abstain'])).toContain('options[1]')
    expect(validateDaoOptions(['no'])).toContain('2 to 10')
    expect(validateDaoOptions(['no', 'yes', '2', '3', '4', '5', '6', '7', '8', '9', '10'])).toContain('2 to 10')
  })

  test('option matching trims whitespace and ignores case', () => {
    expect(validateDaoOptions([' No ', ' YES '])).toBeUndefined()
    expect(isWinningOptionAccepted([' No ', ' YES '], 1)).toBe(true)
  })
})
