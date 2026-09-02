import { DaoProjectData } from '../src/@types'
import { appendProjectLog } from '../src/utils/daoProjectLog'

function project(logs?: unknown): DaoProjectData {
  return { logs } as unknown as DaoProjectData
}

describe('appendProjectLog', () => {
  test('records the caller, timestamp, type and params', () => {
    const p = project([])
    appendProjectLog(p, 'committee-1', 1000, 'dao_project_milestone_claim', { milestoneNumber: 2 })
    expect(p.logs).toEqual([{ caller: 'committee-1', timestamp: 1000, txType: 'dao_project_milestone_claim', params: { milestoneNumber: 2 } }])
  })

  test('initialises the array when it is absent', () => {
    // Projects created before the log existed deserialise without it.
    const p = project(undefined)
    appendProjectLog(p, 'committee-1', 1000, 'dao_project_end')
    expect(p.logs).toHaveLength(1)
  })

  test('a transaction with nothing to identify it records empty params, not a missing field', () => {
    const p = project([])
    appendProjectLog(p, 'committee-1', 1000, 'dao_project_start')
    expect(p.logs[0].params).toEqual({})
  })

  test('appends rather than replacing, so the trail is complete', () => {
    const p = project([])
    appendProjectLog(p, 'committee-1', 1000, 'dao_project_milestone_start', { milestoneNumber: 1, proposedTime: 500 })
    appendProjectLog(p, 'committee-2', 2000, 'dao_project_milestone_start', { milestoneNumber: 1 })
    expect(p.logs.map((l) => l.caller)).toEqual(['committee-1', 'committee-2'])
  })

  test('a proposal records its time and an endorsement does not, so the two are distinguishable', () => {
    // Under the write-once rule a milestone path can only be proposed once, so the presence of
    // proposedTime tells a reader which entry opened the question.
    const p = project([])
    appendProjectLog(p, 'committee-1', 1000, 'dao_project_milestone_end', { milestoneNumber: 1, proposedTime: 500 })
    appendProjectLog(p, 'committee-2', 2000, 'dao_project_milestone_end', { milestoneNumber: 1 })
    expect(p.logs[0].params.proposedTime).toBe(500)
    expect(p.logs[1].params.proposedTime).toBeUndefined()
  })

  test('every address-change entry names the address its sender supported', () => {
    // The rebind rule makes both paths carry it, so the log records support rather than mode.
    const p = project([])
    appendProjectLog(p, 'committee-1', 1000, 'dao_project_change_address', { proposedAddress: 'abc' })
    appendProjectLog(p, 'committee-2', 2000, 'dao_project_change_address', { proposedAddress: 'abc' })
    expect(p.logs.map((l) => l.params.proposedAddress)).toEqual(['abc', 'abc'])
  })

  test('params hold no computed outcomes, so no value is ever a bigint', () => {
    // Guards the drift most likely to creep back: paid, minted, owed and reclaimed are products of
    // the handler, recoverable from the account state and the receipt, and are not bigint-safe here.
    const p = project([])
    appendProjectLog(p, 'contractor', 1000, 'dao_project_milestone_claim', { milestoneNumber: 3 })
    for (const value of Object.values(p.logs[0].params)) {
      expect(typeof value).not.toBe('bigint')
    }
    expect(p.logs[0].params).not.toHaveProperty('paidWei')
  })
})
