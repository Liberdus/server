import { Utils } from '@shardus/lib-types'
import * as crypto from '../src/crypto'
import * as config from '../src/config'
import { groupAccount } from '../src/accounts/groupAccount'
import { groupTreeAccount } from '../src/accounts/groupTreeAccount'
import * as joinRequest from '../src/transactions/group_join_request'
import * as joinReclaim from '../src/transactions/group_join_reclaim'
import * as feeClaim from '../src/transactions/group_fee_claim'
import * as commit from '../src/transactions/group_commit'
import * as leave from '../src/transactions/group_leave'
import * as AccountsStorage from '../src/storage/accountStorage'
import * as utils from '../src/utils'
import { GroupAccount, GroupTreeAccount, UserAccount } from '../src/@types'

/**
 * Threat model T9: the join-fee money paths.
 *
 * A join fee moves requester -> escrow (group_join_request) -> back to the
 * requester (group_join_reclaim), or -> vesting to the approving admin
 * (group_commit) -> the admin (group_fee_claim), or back to the member if they
 * are removed before it vests. Every test runs the real apply() of each step
 * and checks where every unit went: only transaction fees may leave.
 *
 * group_commit's tree replay is stood in for (it has its own tests, which
 * build real MLS); these are about money.
 */
jest.mock('../src/utils/mlsTree', () => ({
  replayCommit: jest.fn(async () => ({
    tree: '[]',
    transcript: { epoch: 1, treeHash: '', confirmedTranscriptHash: '', confirmationTag: '', pskCount: 0 },
    external: false,
  })),
  sameTree: jest.fn(() => true),
}))

const FEE = 10n ** 16n
const JOIN_FEE = FEE * 50n
const VESTING = config.LiberdusFlags.groupJoinFeeVestingMs
const ADMIN = '1'.repeat(64)
const MEMBER = '2'.repeat(64)
const GROUP = '9'.repeat(64)
const TREE = (): string => utils.calculateGroupTreeId(GROUP)
const dapp: any = { log: () => undefined, applyResponseAddReceiptData: () => undefined }
const T0 = 1_700_000_000_000

beforeAll(() => {
  crypto.init('69fa4195670576c0160d660c3be36556ff8d504725be8a59b5a96509e0c994bc')
  crypto.setCustomStringifier(Utils.safeStringify, 'shardus_safeStringify')
  ;(AccountsStorage as any).cachedNetworkAccount = { current: { activeVersion: '1.0.0', transactionFee: FEE } }
})

interface World {
  admin: UserAccount
  member: UserAccount
  group: GroupAccount
  tree: GroupTreeAccount
  wrapped: any
}

const user = (id: string, balance: bigint): UserAccount =>
  ({ id, type: 'UserAccount', hash: '', timestamp: 0, data: { balance, chats: {} } } as any)

const world = (memberBalance = FEE * 1000n): World => {
  const group = groupAccount(
    GROUP,
    { from: ADMIN, groupId: GROUP, groupNonce: 'ab'.repeat(16), mlsGroupId: GROUP, cipherSuite: 84, meta: '', maxMembers: 20, joinFee: JOIN_FEE, fee: FEE } as any,
    T0,
  )
  group.members = [ADMIN]
  group.admins = [ADMIN]
  group.maintenanceBalance = FEE * 1000n // repairs never touch the people under test
  const tree = groupTreeAccount(TREE(), GROUP)
  const admin = user(ADMIN, FEE * 1000n)
  const member = user(MEMBER, memberBalance)
  const wrapped: any = { [ADMIN]: { data: admin }, [MEMBER]: { data: member }, [GROUP]: { data: group }, [TREE()]: { data: tree } }
  return { admin, member, group, tree, wrapped }
}

/** Everything a join fee can be: in someone's balance, in escrow, or vesting. */
const total = (w: World): bigint =>
  w.admin.data.balance +
  w.member.data.balance +
  Object.values(w.tree.pendingJoinRequests).reduce((s, r: any) => s + r.escrow, 0n) +
  w.tree.vestedFees.reduce((s, v) => s + v.amount, 0n)

const tx = (type: string, from: string, at: number, over: Record<string, unknown> = {}): any => ({
  type,
  from,
  groupId: GROUP,
  fee: FEE,
  timestamp: at,
  sign: { owner: from, sig: '00' },
  ...over,
})
const commitTx = (at: number, over: Record<string, unknown>): any =>
  tx('group_commit', ADMIN, at, {
    epoch: 0,
    commit: 'Y29tbWl0',
    proposals: [],
    pskId: '',
    pskNonce: '',
    groupInfo: '',
    ratchetTree: '',
    treeDelta: [],
    addedMembers: [],
    removedMembers: [],
    welcomes: [],
    consumedKeyPackages: [],
    ...over,
  })
const fresh = (): any => ({ success: false, reason: '', status: 400 })

const request = (w: World, at: number): void => {
  const t = tx('group_join_request', MEMBER, at, { escrow: JOIN_FEE, message: '' })
  expect(joinRequest.validate(t, w.wrapped, fresh(), dapp).reason).toBe('This transaction is valid!')
  joinRequest.apply(t, at, `req-${at}`, w.wrapped, dapp, {} as any)
}
const approve = async (w: World, at: number): Promise<void> => {
  await commit.apply(commitTx(at, { addedMembers: [MEMBER] }), at, `add-${at}`, w.wrapped, dapp, {} as any)
}
const remove = async (w: World, at: number): Promise<void> => {
  await commit.apply(commitTx(at, { removedMembers: [MEMBER] }), at, `rm-${at}`, w.wrapped, dapp, {} as any)
}
const leaveGroup = (w: World, at: number): void => {
  leave.apply(tx('group_leave', MEMBER, at), at, `leave-${at}`, w.wrapped, dapp, {} as any)
}

describe('join fees: only transaction fees leave the system', () => {
  test('request, approve, vest, claim: the admin ends up with the fee', async () => {
    const w = world()
    const start = total(w)
    request(w, T0 + 1000)
    await approve(w, T0 + 2000)
    expect(w.tree.vestedFees).toHaveLength(1)
    const claimAt = T0 + 2000 + VESTING
    const claim = tx('group_fee_claim', ADMIN, claimAt)
    expect(feeClaim.validate(claim, w.wrapped, fresh(), dapp).reason).toBe('This transaction is valid!')
    feeClaim.apply(claim, claimAt, 'claim', w.wrapped, dapp, {} as any)
    expect(w.tree.vestedFees).toHaveLength(0)
    // Fees: request + add commit (the group's upkeep pays nothing here) + claim.
    // The add commit also moves a repair deposit from the admin into the group.
    const deposit = FEE * BigInt(config.LiberdusFlags.groupRepairDepositMultiplier)
    expect(total(w)).toBe(start - FEE * 3n - deposit)
    expect(w.member.data.balance).toBe(FEE * 1000n - FEE - JOIN_FEE)
  })

  test('removed before the fee vests: the member gets it back', async () => {
    const w = world()
    request(w, T0 + 1000)
    await approve(w, T0 + 2000)
    const before = w.member.data.balance
    await remove(w, T0 + 3000)
    expect(w.member.data.balance).toBe(before + JOIN_FEE)
    expect(w.tree.vestedFees).toHaveLength(0)
  })

  test('leave, be let back in, be removed: only the second fee comes back', async () => {
    // Leaving forfeits the first fee to the admin. Before this fix the removal
    // refunded every fee still vesting under the address, so leaving and
    // rejoining turned a forfeited fee back into the member's money.
    const w = world()
    request(w, T0 + 1000)
    await approve(w, T0 + 2000) // first membership, first fee
    leaveGroup(w, T0 + 3000) // forfeits it
    request(w, T0 + 4000)
    await approve(w, T0 + 5000) // second membership, second fee
    const before = w.member.data.balance
    await remove(w, T0 + 6000) // both fees are still vesting
    expect(w.member.data.balance).toBe(before + JOIN_FEE) // one fee, not two
    expect(w.tree.vestedFees).toEqual([expect.objectContaining({ admin: ADMIN, member: MEMBER, amount: JOIN_FEE, grantedAt: T0 + 2000 })])
  })

  test('a refund with no account to pay leaves the fee vesting, not lost', async () => {
    const w = world()
    request(w, T0 + 1000)
    await approve(w, T0 + 2000)
    delete w.wrapped[MEMBER]
    await remove(w, T0 + 3000)
    expect(w.tree.vestedFees).toHaveLength(1)
  })
})

describe('reclaiming a join request', () => {
  test('works with nothing left but the escrow, which pays its own fee', () => {
    const w = world(JOIN_FEE + FEE) // exactly enough to request
    request(w, T0 + 1000)
    expect(w.member.data.balance).toBe(BigInt(0))
    const t = tx('group_join_reclaim', MEMBER, T0 + 2000)
    expect(joinReclaim.validate(t, w.wrapped, fresh(), dapp).reason).toBe('This transaction is valid!')
    joinReclaim.apply(t, T0 + 2000, 'reclaim', w.wrapped, dapp, {} as any)
    expect(w.member.data.balance).toBe(JOIN_FEE - FEE)
    expect(w.tree.pendingJoinRequests[MEMBER]).toBeUndefined()
  })
})
