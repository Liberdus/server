import { validatePreCrack } from '../src/transactions/group_commit'
import * as AccountsStorage from '../src/storage/accountStorage'
import { ShardusTypes } from '@shardus/core'

/**
 * validatePreCrack is the subset of validate() that txPreCrackData can run
 * before a transaction enters the queue, where a rejection is free.
 *
 * The property that matters most is the one asserted last: it must reach a
 * verdict WITHOUT the GroupTreeAccount. If it ever starts needing the tree,
 * precrack has to fetch ~112 kB per commit injection and the whole point of the
 * hook is lost -- so that is pinned by a test rather than left to a comment.
 */

const FEE = 10n ** 16n
const ADMIN = '1'.repeat(64)
const MEMBER = '2'.repeat(64)
const OUTSIDER = '3'.repeat(64)
const GROUP = '9'.repeat(64)

beforeAll(() => {
  // getTransactionFeeWei reads the cached network account; the pre-2.4.2 branch
  // returns current.transactionFee directly, which keeps this fixture small.
  ;(AccountsStorage as any).cachedNetworkAccount = {
    current: { activeVersion: '1.0.0', transactionFee: FEE },
  }
})

const userAccount = (id: string, balance = FEE * 100n): any => ({
  id,
  type: 'UserAccount',
  data: { balance },
})

const groupAccount = (epoch: number): any => ({
  id: GROUP,
  type: 'GroupAccount',
  members: [ADMIN, MEMBER],
  admins: [ADMIN],
  epoch,
})

const wrap = (accounts: Record<string, any>): any => {
  const out: Record<string, any> = {}
  for (const [id, data] of Object.entries(accounts)) {
    out[id] = { accountId: id, stateId: '', data, timestamp: 0, accountCreated: false, isPartial: false }
  }
  return out
}

const commitTx = (over: Record<string, unknown> = {}): any => ({
  type: 'group_commit',
  from: MEMBER,
  groupId: GROUP,
  epoch: 4,
  addedMembers: [],
  removedMembers: [],
  fee: FEE,
  ...over,
})

const run = (tx: any, states: any): ShardusTypes.IncomingTransactionResult =>
  validatePreCrack(
    tx,
    states,
    { success: false, reason: 'Tx Validation Fails', status: 400 } as unknown as ShardusTypes.IncomingTransactionResult,
    undefined as never,
  )

const bothAccounts = (epoch: number, balance?: bigint): any =>
  wrap({ [MEMBER]: userAccount(MEMBER, balance), [GROUP]: groupAccount(epoch) })

describe('group_commit validatePreCrack', () => {
  test('a commit naming the current epoch passes', () => {
    const res = run(commitTx(), bothAccounts(4))
    expect(res.success).toBe(true)
  })

  test('a stale epoch is rejected before the queue', () => {
    // The whole reason the hook exists: this is what a lost race looks like,
    // and it used to cost the loser a full fee.
    const res = run(commitTx({ epoch: 4 }), bothAccounts(5))
    expect(res.success).toBe(false)
    expect(res.reason).toContain('stale epoch')
  })

  test('an epoch from the future is rejected too', () => {
    const res = run(commitTx({ epoch: 9 }), bothAccounts(5))
    expect(res.success).toBe(false)
    expect(res.reason).toContain('stale epoch')
  })

  test('a non-member is rejected', () => {
    const states = wrap({ [OUTSIDER]: userAccount(OUTSIDER), [GROUP]: groupAccount(4) })
    const res = run(commitTx({ from: OUTSIDER }), states)
    expect(res.success).toBe(false)
    expect(res.reason).toContain('not a member')
  })

  test('a non-admin cannot add or remove members', () => {
    const res = run(commitTx({ addedMembers: [OUTSIDER] }), bothAccounts(4))
    expect(res.success).toBe(false)
    expect(res.reason).toContain('only an admin')
  })

  test('an admin changing membership passes', () => {
    const states = wrap({ [ADMIN]: userAccount(ADMIN), [GROUP]: groupAccount(4) })
    const res = run(commitTx({ from: ADMIN, addedMembers: [OUTSIDER] }), states)
    expect(res.success).toBe(true)
  })

  test('a missing group is reported in words, not as an exception', () => {
    const res = run(commitTx(), wrap({ [MEMBER]: userAccount(MEMBER) }))
    expect(res.success).toBe(false)
    expect(res.reason).toContain('does not exist')
  })

  test('a fee below the network fee is rejected', () => {
    const res = run(commitTx({ fee: FEE - 1n }), bothAccounts(4))
    expect(res.success).toBe(false)
    expect(res.reason).toContain('network transaction fee')
  })

  test('a sender who cannot cover the fee is rejected', () => {
    const res = run(commitTx(), bothAccounts(4, FEE - 1n))
    expect(res.success).toBe(false)
    expect(res.reason).toContain('sufficient funds')
  })

  test('it reaches a verdict without the GroupTreeAccount', () => {
    // No tree account is present in any fixture above, and this asserts that is
    // load-bearing rather than incidental: precrack must never need to fetch it.
    const states = bothAccounts(4)
    const treeKeys = Object.keys(states).filter((k) => k !== MEMBER && k !== GROUP)
    expect(treeKeys).toHaveLength(0)
    expect(run(commitTx(), states).success).toBe(true)
    expect(run(commitTx({ epoch: 99 }), states).success).toBe(false)
  })
})
