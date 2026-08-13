import { DaoProposalsMeta } from '../src/@types'
import * as crypto from '../src/crypto'
import { backfillProposalIndex, compareIndexEntries, findMissingProposalNumbers, getProposalIndex, recordProposalStatus } from '../src/utils/daoProposalIndex'

crypto.init('69fa4195670576c0160d660c3be36556ff8d504725be8a59b5a96509e0c994bc')

function makeMeta(overrides: Partial<DaoProposalsMeta> = {}): DaoProposalsMeta {
  return {
    id: 'meta',
    type: 'DaoProposalsMeta',
    count: 0,
    proposals: [],
    hash: '',
    timestamp: 0,
    ...overrides,
  }
}

describe('dao proposal index', () => {
  test('inserts a new proposal at the front', () => {
    const meta = makeMeta()
    recordProposalStatus(meta, 1, 'review', false, 1000)
    expect(meta.proposals).toEqual([{ proposal: 1, status: 'review', emergencyFlag: false, timestamp: 1000 }])
  })

  test('upserts on status change without duplicating the entry', () => {
    const meta = makeMeta()
    recordProposalStatus(meta, 1, 'review', false, 1000)
    recordProposalStatus(meta, 2, 'review', false, 1100)
    recordProposalStatus(meta, 1, 'voting', false, 1200)

    expect(meta.proposals).toHaveLength(2)
    expect(meta.proposals.filter((e) => e.proposal === 1)).toHaveLength(1)
    expect(meta.proposals[0]).toEqual({ proposal: 1, status: 'voting', emergencyFlag: false, timestamp: 1200 })
  })

  test('keeps the array ordered most-recent-first', () => {
    const meta = makeMeta()
    recordProposalStatus(meta, 1, 'review', false, 1000)
    recordProposalStatus(meta, 2, 'review', false, 1100)
    recordProposalStatus(meta, 3, 'review', false, 1200)
    expect(meta.proposals.map((e) => e.proposal)).toEqual([3, 2, 1])

    // An older proposal transitioning moves it back to the front — this is the recent-activity
    // ordering the DAO modal wants, not creation order.
    recordProposalStatus(meta, 1, 'voting', false, 1300)
    expect(meta.proposals.map((e) => e.proposal)).toEqual([1, 3, 2])
  })

  test('places an out-of-order timestamp correctly instead of at the front', () => {
    // This is the backfill case: historical entries arrive with timestamps older than what is
    // already indexed, so a plain unshift would break the most-recent-first invariant.
    const meta = makeMeta()
    recordProposalStatus(meta, 10, 'applied', false, 5000)
    recordProposalStatus(meta, 11, 'voting', false, 6000)
    recordProposalStatus(meta, 7, 'rejected', false, 1000) // backfilled, oldest
    recordProposalStatus(meta, 8, 'withheld', false, 5500) // backfilled, middle

    expect(meta.proposals.map((e) => e.proposal)).toEqual([11, 8, 10, 7])
    const timestamps = meta.proposals.map((e) => e.timestamp)
    expect(timestamps).toEqual([...timestamps].sort((x, y) => y - x))
  })

  test('breaks equal timestamps by descending proposal number', () => {
    const meta = makeMeta()
    recordProposalStatus(meta, 2, 'review', false, 1000)
    recordProposalStatus(meta, 5, 'review', false, 1000)
    recordProposalStatus(meta, 3, 'review', false, 1000)
    expect(meta.proposals.map((e) => e.proposal)).toEqual([5, 3, 2])
  })

  test('ordering does not depend on insertion order', () => {
    // Same entries applied in different sequences must converge on the same array, since every
    // node must compute byte-identical output.
    const forward = makeMeta()
    const reverse = makeMeta()
    const entries: Array<[number, number]> = [
      [1, 3000],
      [2, 1000],
      [3, 2000],
      [4, 1000],
    ]
    entries.forEach(([n, ts]) => recordProposalStatus(forward, n, 'review', false, ts))
    ;[...entries].reverse().forEach(([n, ts]) => recordProposalStatus(reverse, n, 'review', false, ts))
    expect(forward.proposals).toEqual(reverse.proposals)
    expect(forward.proposals.map((e) => e.proposal)).toEqual([1, 3, 4, 2])
  })

  test('is deterministic — identical call sequences produce identical arrays', () => {
    const a = makeMeta()
    const b = makeMeta()
    const calls: Array<[number, 'review' | 'voting' | 'accepted']> = [
      [3, 'review'],
      [1, 'voting'],
      [2, 'review'],
      [3, 'accepted'],
      [1, 'accepted'],
    ]
    calls.forEach(([n, s], i) => recordProposalStatus(a, n, s, false, 1000 + i))
    calls.forEach(([n, s], i) => recordProposalStatus(b, n, s, false, 1000 + i))
    expect(a.proposals).toEqual(b.proposals)
  })

  test('re-recording the same status still upserts and reorders', () => {
    // The helper deliberately does not detect no-ops; callers own the previousStatus guard.
    const meta = makeMeta()
    recordProposalStatus(meta, 1, 'review', false, 1000)
    recordProposalStatus(meta, 2, 'review', false, 1100)
    recordProposalStatus(meta, 1, 'review', false, 1200)

    expect(meta.proposals).toHaveLength(2)
    expect(meta.proposals[0]).toEqual({ proposal: 1, status: 'review', emergencyFlag: false, timestamp: 1200 })
  })

  test('an unknown proposal number is inserted rather than ignored', () => {
    const meta = makeMeta()
    recordProposalStatus(meta, 1, 'review', false, 1000)
    recordProposalStatus(meta, 99, 'applied', false, 1100)
    expect(meta.proposals[0]).toEqual({ proposal: 99, status: 'applied', emergencyFlag: false, timestamp: 1100 })
  })

  test('carries emergencyFlag through, and preserves it across status changes', () => {
    const meta = makeMeta()
    recordProposalStatus(meta, 1, 'review', true, 1000)
    recordProposalStatus(meta, 2, 'review', false, 1100)
    expect(meta.proposals.find((e) => e.proposal === 1)?.emergencyFlag).toBe(true)
    expect(meta.proposals.find((e) => e.proposal === 2)?.emergencyFlag).toBe(false)

    // emergency is immutable on the proposal account, so callers pass the same value every time;
    // the upsert must not lose it.
    recordProposalStatus(meta, 1, 'accepted', true, 1200)
    expect(meta.proposals[0]).toEqual({ proposal: 1, status: 'accepted', emergencyFlag: true, timestamp: 1200 })
  })

  test('bumps meta.timestamp so the account is persisted', () => {
    // Without this, src/index.ts would not treat the account as changed and the write would be
    // silently dropped.
    const meta = makeMeta({ timestamp: 500 })
    recordProposalStatus(meta, 1, 'review', false, 1000)
    expect(meta.timestamp).toBe(1000)
  })

  test('tolerates a meta account serialized before the index existed', () => {
    const legacy = makeMeta()
    delete legacy.proposals
    expect(() => recordProposalStatus(legacy, 1, 'review', false, 1000)).not.toThrow()
    expect(legacy.proposals).toEqual([{ proposal: 1, status: 'review', emergencyFlag: false, timestamp: 1000 }])
  })

  test('compareIndexEntries is a total order — no two entries compare equal', () => {
    // Proposal numbers are unique, so the comparator never returns 0. That makes the result
    // independent of the sort implementation's stability, which consensus depends on.
    const a = { proposal: 1, status: 'review' as const, emergencyFlag: false, timestamp: 1000 }
    const b = { proposal: 2, status: 'review' as const, emergencyFlag: false, timestamp: 1000 }
    expect(compareIndexEntries(a, b)).toBeGreaterThan(0)
    expect(compareIndexEntries(b, a)).toBeLessThan(0)
    expect(compareIndexEntries(a, a)).toBe(0)
  })

  test('rejects an account that is not a DaoProposalsMeta', () => {
    const notMeta = { id: 'x', type: 'UserAccount', count: 0, hash: '', timestamp: 0 } as unknown as DaoProposalsMeta
    expect(() => recordProposalStatus(notMeta, 1, 'review', false, 1000)).toThrow('not a DaoProposalsMeta')
  })

  test('getProposalIndex normalizes a missing array in place', () => {
    const legacy = makeMeta()
    delete legacy.proposals
    const proposals = getProposalIndex(legacy)
    expect(proposals).toEqual([])
    expect(legacy.proposals).toBe(proposals)
  })
})

describe('findMissingProposalNumbers', () => {
  test('never returns meta.count itself', () => {
    // During dao_proposal_create, count is already incremented for the proposal being created,
    // whose account is not committed yet. Fetching it would always fail, and since the chunk is
    // all-or-nothing that would abort every backfill forever.
    const meta = makeMeta({ count: 5 })
    expect(findMissingProposalNumbers(meta)).toEqual([1, 2, 3, 4])
  })

  test('returns nothing when the index is complete', () => {
    const meta = makeMeta({ count: 4 })
    for (let n = 1; n < 4; n++) recordProposalStatus(meta, n, 'review', false, 1000 + n)
    expect(findMissingProposalNumbers(meta)).toEqual([])
  })

  test('returns only the gaps, oldest first', () => {
    const meta = makeMeta({ count: 7 })
    recordProposalStatus(meta, 2, 'review', false, 1000)
    recordProposalStatus(meta, 5, 'applied', false, 1100)
    expect(findMissingProposalNumbers(meta)).toEqual([1, 3, 4, 6])
  })

  test('does not derive the gap set from proposals.length', () => {
    // New proposals are always indexed while the historical chunk is optional, so the array can
    // legitimately hold #45 while #1..#44 are absent. Only the actual entry numbers say what is
    // missing — a length-based check would report nothing to do.
    const meta = makeMeta({ count: 46 })
    recordProposalStatus(meta, 45, 'voting', false, 9000)
    expect(findMissingProposalNumbers(meta).slice(0, 4)).toEqual([1, 2, 3, 4])
  })

  test('returns nothing for the very first proposal', () => {
    const meta = makeMeta({ count: 1 })
    expect(findMissingProposalNumbers(meta)).toEqual([])
  })

  test('tolerates a meta account serialized before the index existed', () => {
    const legacy = makeMeta({ count: 3 })
    delete legacy.proposals
    expect(findMissingProposalNumbers(legacy)).toEqual([1, 2])
  })
})

describe('findMissingProposalNumbers batch ceiling', () => {
  test('returns every gap in one batch, not a chunk of them', () => {
    // The whole missing set goes out as a single concurrent batch, so a network upgrading with 40
    // existing proposals fills its entire index on the first creation afterwards.
    const meta = makeMeta({ count: 41 })
    expect(findMissingProposalNumbers(meta)).toHaveLength(40)
  })

  test('caps a pathologically large history at the safety ceiling', () => {
    // Not a configurable chunk size — just a bound on simultaneous in-flight fetches inside a
    // consensus-bound apply(). Such a network converges over a few creations instead of one.
    const meta = makeMeta({ count: 10_000 })
    expect(findMissingProposalNumbers(meta)).toHaveLength(50)
  })
})

describe('backfillProposalIndex', () => {
  function proposalAccount(number: number, over: Record<string, unknown> = {}): unknown {
    return { type: 'DaoProposalAccount', number, status: 'applied', emergency: false, timestamp: 1000 + number, ...over }
  }

  /** Returns accounts by the address the backfill derives, so a fetch for #N gets proposal #N. */
  function makeDapp(byNumber: Record<number, unknown>): { getLocalOrRemoteAccount: jest.Mock; log: jest.Mock } {
    return {
      getLocalOrRemoteAccount: jest.fn(async (address: string) => {
        const hit = Object.entries(byNumber).find(([n]) => crypto.hash(`dao proposal #${n}`) === address)
        if (!hit) return null
        const data = hit[1]
        if (data instanceof Error) throw data
        return { data }
      }),
      log: jest.fn(),
    }
  }

  test('fills every missing proposal in one batch', async () => {
    const meta = makeMeta({ count: 4 })
    recordProposalStatus(meta, 4, 'review', false, 9000)
    const dapp = makeDapp({ 1: proposalAccount(1), 2: proposalAccount(2, { emergency: true }), 3: proposalAccount(3, { status: 'rejected' }) })

    await backfillProposalIndex(meta, dapp as never)

    // Not sorted before comparing: this is the one case where backfilled historical timestamps
    // interleave with a live entry, which is exactly what recordProposalStatus's sort exists for.
    expect(meta.proposals.map((e) => e.proposal)).toEqual([4, 3, 2, 1])
    expect(meta.proposals.find((e) => e.proposal === 2)?.emergencyFlag).toBe(true)
    expect(meta.proposals.find((e) => e.proposal === 3)?.status).toBe('rejected')
    // Backfilled entries carry the account's own timestamp, not the caller's.
    expect(meta.proposals.find((e) => e.proposal === 1)?.timestamp).toBe(1001)
  })

  test('abandons the whole batch when any account is unreachable', async () => {
    // All-or-nothing is what collapses the outcomes to two, so a majority of nodes can still agree.
    // A partial write here would give every node a different array.
    const meta = makeMeta({ count: 4 })
    recordProposalStatus(meta, 4, 'review', false, 9000)
    const dapp = makeDapp({ 1: proposalAccount(1), 3: proposalAccount(3) }) // #2 missing

    await backfillProposalIndex(meta, dapp as never)

    expect(meta.proposals.map((e) => e.proposal)).toEqual([4])
  })

  test('abandons the whole batch when a fetch throws', async () => {
    const meta = makeMeta({ count: 3 })
    recordProposalStatus(meta, 3, 'review', false, 9000)
    const dapp = makeDapp({ 1: proposalAccount(1), 2: new Error('unreachable') })

    await expect(backfillProposalIndex(meta, dapp as never)).resolves.toBeUndefined()
    expect(meta.proposals.map((e) => e.proposal)).toEqual([3])
  })

  test('rejects an account of the wrong type rather than indexing it', async () => {
    const meta = makeMeta({ count: 2 })
    recordProposalStatus(meta, 2, 'review', false, 9000)
    const dapp = makeDapp({ 1: { type: 'UserAccount', number: 1, status: 'applied', emergency: false, timestamp: 1 } })

    await backfillProposalIndex(meta, dapp as never)

    expect(meta.proposals.map((e) => e.proposal)).toEqual([2])
  })

  test('is a no-op once the index is complete', async () => {
    const meta = makeMeta({ count: 3 })
    recordProposalStatus(meta, 1, 'applied', false, 1000)
    recordProposalStatus(meta, 2, 'applied', false, 2000)
    const dapp = makeDapp({})

    await backfillProposalIndex(meta, dapp as never)

    expect(dapp.getLocalOrRemoteAccount).not.toHaveBeenCalled()
  })

  test('never fetches the proposal currently being created', async () => {
    // count is already incremented for the in-flight proposal, whose account is not committed yet.
    const meta = makeMeta({ count: 3 })
    recordProposalStatus(meta, 3, 'review', false, 9000)
    const dapp = makeDapp({ 1: proposalAccount(1), 2: proposalAccount(2) })

    await backfillProposalIndex(meta, dapp as never)

    const asked = dapp.getLocalOrRemoteAccount.mock.calls.map((c) => c[0])
    expect(asked).not.toContain(crypto.hash('dao proposal #3'))
    expect(asked).toHaveLength(2)
  })
})
