import * as crypto from '../src/crypto'
import { DaoProposalIndexEntry, DaoProposalsMeta } from '../src/@types'
import { summary } from '../src/api/dao/proposals'

crypto.init('69fa4195670576c0160d660c3be36556ff8d504725be8a59b5a96509e0c994bc')

function makeEntry(number: number, timestamp: number): DaoProposalIndexEntry {
  return { proposal: number, status: 'voting', emergencyFlag: false, timestamp }
}

function makeMeta(proposals: DaoProposalIndexEntry[] | undefined, timestamp: number, count = proposals?.length ?? 0): DaoProposalsMeta {
  return { id: 'meta', type: 'DaoProposalsMeta', count, proposals, hash: '', timestamp } as DaoProposalsMeta
}

/** Minimal stand-ins for the Shardus dapp and the Express response the handler is given. */
function makeDapp(account: unknown): { getLocalOrRemoteAccount: jest.Mock; log: jest.Mock } {
  return { getLocalOrRemoteAccount: jest.fn().mockResolvedValue(account), log: jest.fn() }
}

function makeRes(): { send: jest.Mock; json: jest.Mock; body: () => unknown } {
  const send = jest.fn()
  const json = jest.fn()
  return {
    send,
    json,
    // The handler uses res.send with a pre-serialized string on the success paths and res.json on
    // the empty/error paths, so read whichever one was called.
    body: () => (send.mock.calls.length > 0 ? JSON.parse(send.mock.calls[0][0]) : json.mock.calls[0]?.[0]),
  }
}

describe('dao/proposals/summary', () => {
  test('returns at most 20 entries, preserving index order', async () => {
    // 25 entries already ordered most-recent-first by the index helper; the endpoint must not
    // reorder them, only cut the window.
    const proposals = Array.from({ length: 25 }, (_, i) => makeEntry(25 - i, 10_000 - i))
    const dapp = makeDapp({ data: makeMeta(proposals, 10_000) })
    const res = makeRes()

    await summary(dapp)({}, res)

    const body = res.body() as { count: number; proposals: DaoProposalIndexEntry[] }
    expect(body.count).toBe(25)
    expect(body.proposals).toHaveLength(20)
    expect(body.proposals[0].proposal).toBe(25)
    expect(body.proposals[19].proposal).toBe(6)
  })

  test('returns everything when there are fewer than 20 entries', async () => {
    const dapp = makeDapp({ data: makeMeta([makeEntry(2, 2000), makeEntry(1, 1000)], 2000) })
    const res = makeRes()

    await summary(dapp)({}, res)

    const body = res.body() as { count: number; proposals: DaoProposalIndexEntry[] }
    expect(body.count).toBe(2)
    expect(body.proposals.map((e) => e.proposal)).toEqual([2, 1])
  })

  test('returns the count and an empty list for a meta account serialized before the index existed', async () => {
    const dapp = makeDapp({ data: makeMeta(undefined, 3000, 12) })
    const res = makeRes()

    await summary(dapp)({}, res)

    expect(res.body()).toEqual({ count: 12, proposals: [] })
  })

  test('returns an empty list when the meta account does not exist yet', async () => {
    const dapp = makeDapp(null)
    const res = makeRes()

    await summary(dapp)({}, res)

    expect(res.json).toHaveBeenCalledWith({ count: 0, proposals: [] })
  })

  test('reflects a status transition on the very next request', async () => {
    // The handler holds no state between requests, so this is really a guard against reintroducing
    // any: a window that lags a transition is the failure mode that would matter.
    const first = makeDapp({ data: makeMeta([makeEntry(1, 1000)], 1000) })
    const resFirst = makeRes()
    await summary(first)({}, resFirst)
    expect((resFirst.body() as { proposals: DaoProposalIndexEntry[] }).proposals.map((e) => e.proposal)).toEqual([1])

    const second = makeDapp({ data: makeMeta([makeEntry(2, 2000), makeEntry(1, 1000)], 2000) })
    const resSecond = makeRes()
    await summary(second)({}, resSecond)
    expect((resSecond.body() as { proposals: DaoProposalIndexEntry[] }).proposals.map((e) => e.proposal)).toEqual([2, 1])
  })

  test('refetches the meta account on every request', async () => {
    // Nothing may be served without reading current state first.
    const meta = makeMeta([makeEntry(1, 1000)], 1000)
    const dapp = makeDapp({ data: meta })

    await summary(dapp)({}, makeRes())
    await summary(dapp)({}, makeRes())

    expect(dapp.getLocalOrRemoteAccount).toHaveBeenCalledTimes(2)
  })

  test('reports the error instead of throwing when the fetch fails', async () => {
    const dapp = { getLocalOrRemoteAccount: jest.fn().mockRejectedValue(new Error('unreachable')), log: jest.fn() }
    const res = makeRes()

    await expect(summary(dapp)({}, res)).resolves.toBeUndefined()
    expect(res.json).toHaveBeenCalledWith({ error: expect.any(Error) })
    expect(dapp.log).toHaveBeenCalled()
  })
})
