import { Utils } from '@shardus/lib-types'
import { VectorBufferStream } from '@shardus/core'
import * as crypto from '../src/crypto'
import { groupAccount, serializeGroupAccount, deserializeGroupAccount } from '../src/accounts/groupAccount'
import { groupTreeAccount } from '../src/accounts/groupTreeAccount'
import * as utils from '../src/utils'
import { keys as reclaimKeys } from '../src/transactions/group_join_reclaim'
import { keys as requestKeys } from '../src/transactions/group_join_request'
import { GroupAccount, GroupTreeAccount } from '../src/@types'

/**
 * pendingJoinCount mirrors the number of outstanding join requests onto the
 * GroupAccount, so an admin's client can notice a new one from an endpoint it
 * already polls rather than loading the ratchet tree to count an integer.
 *
 * The property that keeps it honest is that it is RECOMPUTED from the map and
 * never incremented -- so it cannot drift, whatever order things happen in.
 */

const ADMIN = '1'.repeat(64)
const GROUP = '9'.repeat(64)

beforeAll(() => {
  crypto.init('69fa4195670576c0160d660c3be36556ff8d504725be8a59b5a96509e0c994bc')
  crypto.setCustomStringifier(Utils.safeStringify, 'shardus_safeStringify')
})

const makeGroup = (): GroupAccount =>
  groupAccount(
    GROUP,
    {
      from: ADMIN,
      groupId: GROUP,
      groupNonce: 'ab'.repeat(16),
      mlsGroupId: 'ff'.repeat(8),
      cipherSuite: 84,
      meta: 'meta',
      maxMembers: 20,
      joinFee: BigInt(0),
      fee: 10n ** 16n,
    } as any,
    1_700_000_000_000,
  )

const makeTree = (addresses: string[] = []): GroupTreeAccount => {
  const t = groupTreeAccount(utils.calculateGroupTreeId(GROUP), GROUP)
  for (const a of addresses) {
    t.pendingJoinRequests[a] = { escrow: BigInt(0), message: '', timestamp: 0 } as any
  }
  return t
}

describe('the mirrored count', () => {
  test('a new group has none', () => {
    expect(makeGroup().pendingJoinCount).toBe(0)
  })

  test('it follows the map up and down', () => {
    const group = makeGroup()
    const tree = makeTree()

    tree.pendingJoinRequests['a'] = { escrow: BigInt(0), message: '', timestamp: 0 } as any
    utils.syncPendingJoinCount(group, tree)
    expect(group.pendingJoinCount).toBe(1)

    tree.pendingJoinRequests['b'] = { escrow: BigInt(0), message: '', timestamp: 0 } as any
    utils.syncPendingJoinCount(group, tree)
    expect(group.pendingJoinCount).toBe(2)

    delete tree.pendingJoinRequests['a']
    utils.syncPendingJoinCount(group, tree)
    expect(group.pendingJoinCount).toBe(1)
  })

  test('it is recomputed, so it cannot drift', () => {
    // Corrupt the count and mutate the map: a counter that incremented would
    // stay wrong forever, a derived one self-heals on the next change.
    const group = makeGroup()
    const tree = makeTree(['a', 'b', 'c'])
    group.pendingJoinCount = 99
    utils.syncPendingJoinCount(group, tree)
    expect(group.pendingJoinCount).toBe(3)
  })

  test('clearing every request returns it to zero', () => {
    const group = makeGroup()
    const tree = makeTree(['a', 'b'])
    utils.syncPendingJoinCount(group, tree)
    expect(group.pendingJoinCount).toBe(2)
    tree.pendingJoinRequests = {}
    utils.syncPendingJoinCount(group, tree)
    expect(group.pendingJoinCount).toBe(0)
  })

  test('a missing account is a no-op rather than a throw', () => {
    expect(() => utils.syncPendingJoinCount(undefined as any, makeTree())).not.toThrow()
    expect(() => utils.syncPendingJoinCount(makeGroup(), undefined as any)).not.toThrow()
  })
})

describe('the accounts a transaction must claim', () => {
  test('withdrawing a request names the group account', () => {
    // Without this the count would stay high after a withdrawal and admins
    // would see a request that no longer exists. This is the reason
    // group_join_reclaim's key set had to grow.
    const k = reclaimKeys({ from: ADMIN, groupId: GROUP } as any, {
      sourceKeys: [],
      targetKeys: [],
      allKeys: [],
    } as any)
    expect(k.targetKeys).toContain(GROUP)
    expect(k.targetKeys).toContain(utils.calculateGroupTreeId(GROUP))
  })

  test('making a request already named it', () => {
    const k = requestKeys({ from: ADMIN, groupId: GROUP } as any, {
      sourceKeys: [],
      targetKeys: [],
      allKeys: [],
    } as any)
    expect(k.targetKeys).toContain(GROUP)
  })
})

describe('serialization', () => {
  test('the count survives a round trip', () => {
    const group = makeGroup()
    group.pendingJoinCount = 4
    const out = new VectorBufferStream(0)
    serializeGroupAccount(out, group, true)
    const back = deserializeGroupAccount(VectorBufferStream.fromBuffer(out.getBuffer()), true)
    expect(back.pendingJoinCount).toBe(4)
    // the field ahead of it is still intact
    expect(back.maintenanceBalance).toBe(group.maintenanceBalance)
  })

  test('a buffer written before the field existed decodes as zero', () => {
    // Same tolerance as maintenanceBalance: an older group must stay loadable.
    const group = makeGroup()
    group.pendingJoinCount = 7
    const out = new VectorBufferStream(0)
    serializeGroupAccount(out, group, true)

    // Chop the trailing uint32 to reproduce the pre-field layout exactly.
    const full = out.getBuffer()
    const truncated = full.slice(0, full.length - 4)
    const back = deserializeGroupAccount(VectorBufferStream.fromBuffer(truncated), true)
    expect(back.pendingJoinCount).toBe(0)
    expect(back.maintenanceBalance).toBe(group.maintenanceBalance)
    expect(back.createdBy).toBe(group.createdBy)
  })
})
