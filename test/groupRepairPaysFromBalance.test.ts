import { VectorBufferStream } from '@shardus/core'
import { Utils } from '@shardus/lib-types'
import * as crypto from '../src/crypto'
import { groupAccount } from '../src/accounts/groupAccount'
import { groupTreeAccount } from '../src/accounts/groupTreeAccount'
import { apply } from '../src/transactions/group_commit'
import * as AccountsStorage from '../src/storage/accountStorage'
import * as utils from '../src/utils'
import { GroupAccount, GroupTreeAccount, UserAccount } from '../src/@types'

/**
 * Who pays the fee for a commit.
 *
 * The rule the group's balance is there to express: a commit that repairs the
 * tree is the group's own upkeep and the group pays for it; everything else is
 * charged to whoever sent it. "Repairs the tree" is decided from the stored
 * node array, so these drive apply() with real accounts and watch the two
 * balances move.
 */

const FEE = 10n ** 16n
const ADMIN = '1'.repeat(64)
const MEMBER = '2'.repeat(64)
const GROUP = '9'.repeat(64)

beforeAll(() => {
  crypto.init('69fa4195670576c0160d660c3be36556ff8d504725be8a59b5a96509e0c994bc')
  crypto.setCustomStringifier(Utils.safeStringify, 'shardus_safeStringify')
  ;(AccountsStorage as any).cachedNetworkAccount = {
    current: { activeVersion: '1.0.0', transactionFee: FEE },
  }
})

const dapp: any = { log: () => undefined, applyResponseAddReceiptData: () => undefined }

const makeGroup = (over: Partial<GroupAccount> = {}): GroupAccount => {
  const g = groupAccount(
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
      fee: FEE,
    } as any,
    1_700_000_000_000,
  )
  g.members = [ADMIN, MEMBER]
  g.admins = [ADMIN]
  return Object.assign(g, over)
}

/** A stored tree: `null` is a blank node, a string is an occupied one. */
const makeTree = (nodes: (string | null)[]): GroupTreeAccount => {
  const t = groupTreeAccount(utils.calculateGroupTreeId(GROUP), GROUP)
  t.ratchetTree = JSON.stringify(nodes)
  return t
}

const user = (id: string, balance: bigint): UserAccount =>
  ({ id, type: 'UserAccount', hash: '', timestamp: 0, data: { balance, chats: {} } } as any)

const commitTx = (over: Record<string, unknown> = {}): any => ({
  type: 'group_commit',
  from: MEMBER,
  groupId: GROUP,
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
  fee: FEE,
  timestamp: 1_700_000_100_000,
  sign: { owner: MEMBER, sig: '00' },
  ...over,
})

/** Runs apply() and reports where the fee came from. */
const applyCommit = (
  tx: any,
  opts: { treeNodes: (string | null)[]; balance: bigint; senderBalance?: bigint },
): { group: GroupAccount; sender: UserAccount } => {
  const group = makeGroup({ maintenanceBalance: opts.balance })
  const tree = makeTree(opts.treeNodes)
  const sender = user(tx.from, opts.senderBalance ?? FEE * 100n)
  const wrappedStates: any = {
    [tx.from]: { data: sender },
    [GROUP]: { data: group },
    [utils.calculateGroupTreeId(GROUP)]: { data: tree },
  }
  // apply() writes a chat entry onto each added member, so they have to be here.
  for (const address of tx.addedMembers) wrappedStates[address] = { data: user(address, BigInt(0)) }
  apply(tx, 1_700_000_200_000, 'tx-id', wrappedStates, dapp, {} as any)
  return { group, sender }
}

describe('a repair commit is paid for by the group', () => {
  test('filling a blank node draws on the maintenance balance, not the sender', () => {
    const startingSender = FEE * 100n
    const { group, sender } = applyCommit(commitTx({ treeDelta: [{ i: 1, n: 'bm9kZQ==' }] }), {
      treeNodes: ['a', null, 'c'], // node 1 is blank
      balance: FEE * 5n,
      senderBalance: startingSender,
    })
    expect(group.maintenanceBalance).toBe(FEE * 4n)
    expect(sender.data.balance).toBe(startingSender)
  })

  test('a member with an empty wallet can still perform a funded repair', () => {
    // The person this whole mechanism exists to stop charging.
    const { group, sender } = applyCommit(commitTx({ treeDelta: [{ i: 1, n: 'bm9kZQ==' }] }), {
      treeNodes: ['a', null, 'c'],
      balance: FEE * 3n,
      senderBalance: BigInt(0),
    })
    expect(group.maintenanceBalance).toBe(FEE * 2n)
    expect(sender.data.balance).toBe(BigInt(0))
  })

  test('a node past the end of the trimmed array counts as blank', () => {
    // Trailing blanks are trimmed on write, so a removal on the right of the
    // tree leaves its ancestors simply absent rather than present-and-null.
    const { group } = applyCommit(commitTx({ treeDelta: [{ i: 6, n: 'bm9kZQ==' }] }), {
      treeNodes: ['a', 'b', 'c'],
      balance: FEE * 5n,
    })
    expect(group.maintenanceBalance).toBe(FEE * 4n)
  })
})

describe('everything else is charged to the sender', () => {
  test('a commit that overwrites occupied nodes is not a repair', () => {
    const startingSender = FEE * 100n
    const { group, sender } = applyCommit(commitTx({ treeDelta: [{ i: 0, n: 'bm9kZQ==' }] }), {
      treeNodes: ['a', 'b', 'c'], // nothing blank
      balance: FEE * 5n,
      senderBalance: startingSender,
    })
    expect(group.maintenanceBalance).toBe(FEE * 5n)
    expect(sender.data.balance).toBe(startingSender - FEE)
  })

  test('blanking a node is damage, not repair', () => {
    const startingSender = FEE * 100n
    const { group, sender } = applyCommit(commitTx({ treeDelta: [{ i: 1, n: null }] }), {
      treeNodes: ['a', 'b', 'c'],
      balance: FEE * 5n,
      senderBalance: startingSender,
    })
    expect(group.maintenanceBalance).toBe(FEE * 5n)
    expect(sender.data.balance).toBe(startingSender - FEE)
  })

  test('an underfunded group cannot pay, so the sender does', () => {
    const startingSender = FEE * 100n
    const { group, sender } = applyCommit(commitTx({ treeDelta: [{ i: 1, n: 'bm9kZQ==' }] }), {
      treeNodes: ['a', null, 'c'],
      balance: FEE - 1n, // one wei short
      senderBalance: startingSender,
    })
    expect(group.maintenanceBalance).toBe(FEE - 1n)
    expect(sender.data.balance).toBe(startingSender - FEE)
  })

  test('a commit that adds a member is never a repair, and collects a deposit', () => {
    const startingSender = FEE * 100n
    const tx = commitTx({
      from: ADMIN,
      addedMembers: ['7'.repeat(64)],
      welcomes: [],
      treeDelta: [{ i: 1, n: 'bm9kZQ==' }], // fills a blank, but membership changed
    })
    const { group, sender } = applyCommit(tx, {
      treeNodes: ['a', null, 'c'],
      balance: FEE * 5n,
      senderBalance: startingSender,
    })
    const deposit = FEE * 2n // groupRepairDepositMultiplier
    // Balance went UP by the deposit and was not spent on the fee.
    expect(group.maintenanceBalance).toBe(FEE * 5n + deposit)
    expect(sender.data.balance).toBe(startingSender - FEE - deposit)
  })
})
