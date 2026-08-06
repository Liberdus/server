jest.mock('../src/utils/daoParamValidation', () => ({
  validateChangesPayload: jest.fn(() => undefined),
}))

import type { DaoProposalAccount } from '../src/@types'
import { validateChangesPayload } from '../src/utils/daoParamValidation'
import { getSelectedChanges, isNestedChangeSets, validateProposalChangeSets } from '../src/utils/daoProposalChangeSets'

const changeA = { key: 'pctBurned', value: '60', current: '50' }
const changeB = { key: 'pctBurned', value: '70', current: '50' }

function proposalWithChanges(changes: unknown, winningOptionIndex?: number, emergency = false): DaoProposalAccount {
  return {
    proposalType: 'governance',
    emergency,
    options: ['no', 'Set burn to 60', 'Set burn to 70'],
    winningOptionIndex,
    governance: { changes },
  } as DaoProposalAccount
}

describe('dao proposal change sets', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  test('detects nested change sets', () => {
    expect(isNestedChangeSets([changeA])).toBe(false)
    expect(isNestedChangeSets([[changeA], [changeB]])).toBe(true)
  })

  test('selected nested change set maps option index minus one', () => {
    const proposal = proposalWithChanges([[changeA], [changeB]], 2)
    expect(getSelectedChanges(proposal)).toEqual([changeB])
  })

  test('flat changes are selected directly', () => {
    const proposal = proposalWithChanges([changeA])
    expect(getSelectedChanges(proposal)).toEqual([changeA])
  })

  test('nested regular proposal fails closed without a valid winning option', () => {
    expect(() => getSelectedChanges(proposalWithChanges([[changeA], [changeB]], 0))).toThrow('winning option')
    expect(() => getSelectedChanges(proposalWithChanges([[changeA], [changeB]], 3))).toThrow('winning option')
    expect(() => getSelectedChanges(proposalWithChanges([[changeA], []], 2))).toThrow('winning option')
  })

  test('emergency nested proposal selects its single action change set without a winning option', () => {
    const proposal = proposalWithChanges([[changeA]], undefined, true)
    expect(getSelectedChanges(proposal)).toEqual([changeA])
  })

  test('flat changes are rejected for new proposal creation', () => {
    expect(validateProposalChangeSets('governance', ['no', 'A'], [changeA], undefined, undefined, false)).toContain('nested changes required')
    expect(validateProposalChangeSets('governance', ['no', 'A', 'B'], [changeA], undefined, undefined, false)).toContain('nested changes required')
  })

  test('invalid change payload shapes are rejected', () => {
    expect(validateProposalChangeSets('governance', ['no', 'A'], [], undefined, undefined, false)).toContain('non-empty')
    expect(validateProposalChangeSets('governance', ['no', 'A'], 'bad' as any, undefined, undefined, false)).toContain('non-empty')
    expect(validateProposalChangeSets('governance', ['no', 'A', 'B'], [[changeA], changeB] as any, undefined, undefined, false)).toContain('array')
    expect(validateProposalChangeSets('governance', ['no', 'A'], [[]], undefined, undefined, false)).toContain('non-empty')
  })

  test('nested changes require one set per action option', () => {
    expect(validateProposalChangeSets('governance', ['no', 'A', 'B'], [[changeA]], undefined, undefined, false)).toContain('must have exactly')
  })

  test('emergency nested proposals allow only one action change set', () => {
    expect(validateProposalChangeSets('governance', ['no', 'A'], [[changeA]], undefined, undefined, true)).toBeUndefined()
    expect(validateProposalChangeSets('governance', ['no', 'A', 'B'], [[changeA], [changeB]], undefined, undefined, true)).toContain('emergency')
  })

  test('duplicate keys are scoped to each change set', () => {
    expect(validateProposalChangeSets('governance', ['no', 'A'], [[changeA, changeA]], undefined, undefined, false)).toContain('duplicate')
    expect(validateProposalChangeSets('governance', ['no', 'A', 'B'], [[changeA], [changeB]], undefined, undefined, false)).toBeUndefined()
  })

  test('each valid nested change set is passed to parameter validation', () => {
    expect(validateProposalChangeSets('governance', ['no', 'A', 'B'], [[changeA], [changeB]], undefined, undefined, false)).toBeUndefined()
    expect(validateChangesPayload).toHaveBeenCalledTimes(2)
    expect(validateChangesPayload).toHaveBeenNthCalledWith(1, 'governance', [changeA], undefined, undefined)
    expect(validateChangesPayload).toHaveBeenNthCalledWith(2, 'governance', [changeB], undefined, undefined)
  })
})
