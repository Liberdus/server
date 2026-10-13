import { Utils } from '@shardus/lib-types'
import * as crypto from '../src/crypto'
import * as config from '../src/config'
import { groupAccount } from '../src/accounts/groupAccount'
import { groupTreeAccount } from '../src/accounts/groupTreeAccount'
import * as joinRequest from '../src/transactions/group_join_request'
import * as decline from '../src/transactions/group_join_decline'
import * as commit from '../src/transactions/group_commit'
import * as AccountsStorage from '../src/storage/accountStorage'
import * as utils from '../src/utils'
import { GroupAccount, GroupTreeAccount, UserAccount } from '../src/@types'

/**
 * Threat model T8: nobody may shut a group to new members by filling its
 * pending join-request slots.
 *
 * Requests now expire (groupJoinRequestTimeoutMs): an expired one stops holding
 * a slot and cannot be approved. And an admin can decline requests outright
 * (group_join_decline), returning their escrow. Real apply()s throughout;
 * group_commit's tree replay is stood in for, as in the money tests.
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
const ESCROW = FEE * 5n
const TIMEOUT = config.LiberdusFlags.groupJoinRequestTimeoutMs
const ADMIN = '1'.repeat(64)
const GROUP = '9'.repeat(64)
const T0 = 1_700_000_000_000
const requester = (n: number): string => n.toString(16).padStart(64, 'a')
const dapp: any = { log: () => undefined, applyResponseAddReceiptData: () => undefined }
const fresh = (): any => ({ success: false, reason: '', status: 400 })
let savedCap: number

beforeAll(() => {
  crypto.init('69fa4195670576c0160d660c3be36556ff8d504725be8a59b5a96509e0c994bc')
  crypto.setCustomStringifier(Utils.safeStringify, 'shardus_safeStringify')
  ;(AccountsStorage as any).cachedNetworkAccount = { current: { activeVersion: '1.0.0', transactionFee: FEE } }
  // A small cap keeps the flood short; the rule is the same at 100.
  savedCap = config.LiberdusFlags.groupMaxPendingJoinRequests
  ;(config.LiberdusFlags as any).groupMaxPendingJoinRequests = 3
})
afterAll(() => {
  ;(config.LiberdusFlags as any).groupMaxPendingJoinRequests = savedCap
})

interface World {
  group: GroupAccount
  tree: GroupTreeAccount
  wrapped: any
  user: (id: string) => UserAccount
}

const world = (joinFee: bigint): World => {
  const group = groupAccount(
    GROUP,
    { from: ADMIN, groupId: GROUP, groupNonce: 'ab'.repeat(16), mlsGroupId: GROUP, cipherSuite: 84, meta: '', maxMembers: 50, joinFee, fee: FEE } as any,
    T0,
  )
  group.members = [ADMIN]
  group.admins = [ADMIN]
  group.maintenanceBalance = FEE * 1000n
  const tree = groupTreeAccount(utils.calculateGroupTreeId(GROUP), GROUP)
  const wrapped: any = { [GROUP]: { data: group }, [utils.calculateGroupTreeId(GROUP)]: { data: tree } }
  const user = (id: string): UserAccount => {
    if (!wrapped[id]) wrapped[id] = { data: { id, type: 'UserAccount', hash: '', timestamp: 0, data: { balance: FEE * 100n, chats: {} } } }
    return wrapped[id].data
  }
  user(ADMIN)
  return { group, tree, wrapped, user }
}

const tx = (type: string, from: string, at: number, over: Record<string, unknown> = {}): any => ({
  type,
  from,
  groupId: GROUP,
  fee: FEE,
  timestamp: at,
  sign: { owner: from, sig: '00' },
  ...over,
})

/** Sends a join request; returns validate's verdict and applies it if valid. */
const ask = (w: World, who: string, at: number): string => {
  w.user(who)
  const t = tx('group_join_request', who, at, { escrow: w.group.joinFee, message: '' })
  const verdict = joinRequest.validate(t, w.wrapped, fresh(), dapp).reason
  if (verdict === 'This transaction is valid!') joinRequest.apply(t, at, `req-${who}-${at}`, w.wrapped, dapp, {} as any)
  return verdict
}

describe('join requests expire', () => {
  test('a full group reopens once the flood expires, and expired requests stop counting', () => {
    const w = world(BigInt(0))
    for (let i = 1; i <= 3; i++) expect(ask(w, requester(i), T0 + i)).toBe('This transaction is valid!')
    expect(ask(w, requester(9), T0 + 10)).toBe('this group has too many pending join requests; try again later.')
    expect(w.group.pendingJoinCount).toBe(3)

    const later = T0 + TIMEOUT + 10
    expect(ask(w, requester(9), later)).toBe('This transaction is valid!')
    // The expired, escrow-free requests were pruned when the tree was written.
    expect(Object.keys(w.tree.pendingJoinRequests)).toEqual([requester(9)])
    expect(w.group.pendingJoinCount).toBe(1)
  })

  test('re-requesting after your own request expired replaces it and returns its escrow', () => {
    const w = world(ESCROW)
    const me = requester(1)
    ask(w, me, T0)
    expect(ask(w, me, T0 + 1000)).toBe('a join request from this account is already pending.')
    const before = w.user(me).data.balance
    expect(ask(w, me, T0 + TIMEOUT + 1)).toBe('This transaction is valid!')
    // Old escrow back, new escrow and the fee out.
    expect(w.user(me).data.balance).toBe(before + ESCROW - ESCROW - FEE)
    expect(w.tree.pendingJoinRequests[me].timestamp).toBe(T0 + TIMEOUT + 1)
  })

  test('an expired request with escrow is kept until its requester or an admin acts', () => {
    const w = world(ESCROW)
    ask(w, requester(1), T0)
    ask(w, requester(2), T0 + TIMEOUT + 1) // writes the tree after requester 1 expired
    expect(w.tree.pendingJoinRequests[requester(1)]).toBeDefined()
    expect(w.group.pendingJoinCount).toBe(1) // but it no longer holds a slot
  })

  test('an expired request is not vested on approval: its escrow goes back', async () => {
    const w = world(ESCROW)
    const late = requester(1)
    ask(w, late, T0)
    const before = w.user(late).data.balance
    const at = T0 + TIMEOUT + 5
    await commit.apply(
      tx('group_commit', ADMIN, at, {
        epoch: 0, commit: 'Y29tbWl0', proposals: [], pskId: '', pskNonce: '', groupInfo: '', ratchetTree: '', treeDelta: [],
        addedMembers: [late], removedMembers: [], welcomes: [], consumedKeyPackages: [],
      }),
      at, 'add', w.wrapped, dapp, {} as any,
    )
    expect(w.tree.vestedFees).toHaveLength(0)
    expect(w.user(late).data.balance).toBe(before + ESCROW)
    expect(w.tree.pendingJoinRequests[late]).toBeUndefined()
  })
})

describe('an admin can decline join requests', () => {
  const run = (w: World, from: string, requesters: string[], at: number): string => {
    const t = tx('group_join_decline', from, at, { requesters })
    const verdict = decline.validate(t, w.wrapped, fresh(), dapp).reason
    if (verdict === 'This transaction is valid!') decline.apply(t, at, 'decline', w.wrapped, dapp, {} as any)
    return verdict
  }

  test('declined requests are gone, their escrow is back, and the slots are free', () => {
    const w = world(ESCROW)
    for (let i = 1; i <= 3; i++) ask(w, requester(i), T0 + i)
    const balances = [1, 2].map((i) => w.user(requester(i)).data.balance)
    const adminBefore = w.user(ADMIN).data.balance
    expect(run(w, ADMIN, [requester(1), requester(2)], T0 + 100)).toBe('This transaction is valid!')
    expect(Object.keys(w.tree.pendingJoinRequests)).toEqual([requester(3)])
    expect(w.user(requester(1)).data.balance).toBe(balances[0] + ESCROW)
    expect(w.user(requester(2)).data.balance).toBe(balances[1] + ESCROW)
    expect(w.user(ADMIN).data.balance).toBe(adminBefore - FEE) // one fee for the batch
    expect(w.group.pendingJoinCount).toBe(1)
    expect(ask(w, requester(9), T0 + 200)).toBe('This transaction is valid!')
  })

  test('only the admin may decline', () => {
    const w = world(ESCROW)
    ask(w, requester(1), T0)
    const outsider = requester(7)
    w.user(outsider)
    expect(run(w, outsider, [requester(1)], T0 + 10)).toBe('only an admin may decline join requests.')
  })

  test('declining someone who has not asked is refused', () => {
    const w = world(ESCROW)
    expect(run(w, ADMIN, [requester(5)], T0 + 10)).toBe(`no pending join request from ${requester(5)}.`)
  })

  test('a batch is at most ten requesters', () => {
    const many = Array.from({ length: decline.MAX_DECLINES_PER_TX + 1 }, (_, i) => requester(i + 1))
    const res = decline.validate_fields({ ...tx('group_join_decline', ADMIN, T0, { requesters: many }) }, fresh())
    expect(res.reason).toBe(`tx "requesters" must list between 1 and ${decline.MAX_DECLINES_PER_TX} addresses.`)
  })
})
