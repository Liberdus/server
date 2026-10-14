import { VectorBufferStream } from '@shardus/core'
import { Utils } from '@shardus/lib-types'
import * as crypto from '../src/crypto'
import { groupAccount, serializeGroupAccount } from '../src/accounts/groupAccount'
import { groupTreeAccount, serializeGroupTreeAccount } from '../src/accounts/groupTreeAccount'
import * as message from '../src/transactions/group_message'
import * as commit from '../src/transactions/group_commit'
import * as publish from '../src/transactions/group_keypackage_publish'
import * as config from '../src/config'
import * as AccountsStorage from '../src/storage/accountStorage'
import * as utils from '../src/utils'
import { GroupAccount, GroupTreeAccount, UserAccount } from '../src/@types'

/**
 * Threat model T7: a group's accounts must stay small enough to move.
 *
 * Every group_message and group_commit carries the GroupAccount between nodes,
 * and group_commit the GroupTreeAccount too; Liberdus caps one internal message
 * at 10 MB, and a joining node syncs accounts 50 to a page. An account past
 * that cannot be transferred, so it can never be pruned or used again. At 64 kB
 * per message, $1.55 of messages got a group there.
 *
 * group_commit's tree replay is stood in for, as in the money tests; these are
 * about what gets stored, not MLS.
 */
// The tree the stood-in replay computes; the budget tests make it large.
let mockTree = '[]'
jest.mock('../src/utils/mlsTree', () => ({
  replayCommit: jest.fn(async () => ({
    tree: mockTree,
    transcript: { epoch: 1, treeHash: '', confirmedTranscriptHash: '', confirmationTag: '', pskCount: 0 },
    external: false,
  })),
  sameTree: jest.fn(() => true),
}))

const FEE = 10n ** 16n
const ADMIN = '1'.repeat(64)
const MEMBER = '2'.repeat(64)
const GROUP = '9'.repeat(64)
const TREE = (): string => utils.calculateGroupTreeId(GROUP)
const T0 = 1_700_000_000_000
const dapp: any = { log: () => undefined, applyResponseAddReceiptData: () => undefined }
const fresh = (): any => ({ success: false, reason: '', status: 400 })

beforeAll(() => {
  crypto.init('69fa4195670576c0160d660c3be36556ff8d504725be8a59b5a96509e0c994bc')
  crypto.setCustomStringifier(Utils.safeStringify, 'shardus_safeStringify')
  ;(AccountsStorage as any).cachedNetworkAccount = {
    current: { activeVersion: '1.0.0', transactionFee: FEE, maintenanceFee: 0, maintenanceInterval: 1e15 },
  }
})

interface World {
  group: GroupAccount
  tree: GroupTreeAccount
  wrapped: any
}

const user = (id: string): UserAccount =>
  ({ id, type: 'UserAccount', hash: '', timestamp: 0, lastMaintenance: T0, data: { balance: FEE * 100000n, chats: {} } } as any)

const world = (): World => {
  const group = groupAccount(
    GROUP,
    { from: ADMIN, groupId: GROUP, groupNonce: 'ab'.repeat(16), mlsGroupId: GROUP, cipherSuite: 84, meta: '', maxMembers: 50, joinFee: 0n, fee: FEE } as any,
    T0,
  )
  group.members = [ADMIN]
  group.admins = [ADMIN]
  group.maintenanceBalance = FEE * 1000n
  const tree = groupTreeAccount(TREE(), GROUP)
  const wrapped: any = {
    [ADMIN]: { data: user(ADMIN) },
    [MEMBER]: { data: user(MEMBER) },
    [GROUP]: { data: group },
    [TREE()]: { data: tree },
  }
  return { group, tree, wrapped }
}

const messageTx = (bytes: number, at: number): any => ({
  type: 'group_message',
  from: ADMIN,
  groupId: GROUP,
  epoch: 0,
  message: 'A'.repeat(bytes),
  fee: FEE,
  timestamp: at,
  sign: { owner: ADMIN, sig: '00' },
})

/**
 * True when validate_fields lets a message of this many bytes past its size
 * rule. Unsigned, so an accepted one stops at the signer check that follows.
 */
const sizeAccepted = (bytes: number): boolean =>
  message.validate_fields({ ...messageTx(bytes, T0), sign: undefined }, fresh()).reason === 'not signed by from account'

/** The largest message the size rule accepts, by binary search up to 1 MB. */
const largestAccepted = (): number => {
  let lo = 1
  let hi = 1024 * 1024
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2)
    if (sizeAccepted(mid)) lo = mid
    else hi = mid - 1
  }
  return lo
}

const serializedBytes = (group: GroupAccount): number => {
  const out = new VectorBufferStream(0)
  serializeGroupAccount(out, group, true)
  return out.getBuffer().length
}

describe('group_message size', () => {
  test('the largest message accepted is 4 kB, twice what the client sends', () => {
    expect(largestAccepted()).toBe(4 * 1024)
  })

  test('a group filled with the largest accepted messages stays small enough to move', () => {
    const w = world()
    const biggest = largestAccepted()
    // The count cap keeps 500; send more to show the count, not luck, holds it.
    for (let i = 0; i < 520; i++) {
      const at = T0 + (i + 1) * 1000
      message.apply(messageTx(biggest, at), at, `msg-${i}`.padEnd(64, '0'), w.wrapped, dapp, {} as any)
    }
    // Pruned to 500 before each new message is added, so 501 at rest.
    expect(w.group.messages).toHaveLength(501)
    // ~2.3 MB. At 64 kB per message this was ~33 MB, past the 10 MB a node can send.
    expect(serializedBytes(w.group)).toBeLessThan(2.5 * 1024 * 1024)
  })
})

/** A commit adding MEMBER, field-valid up to its signature. */
const addTx = (over: { tx?: Record<string, unknown>; env?: Record<string, unknown>; sealed?: Record<string, unknown> } = {}): any => ({
  type: 'group_commit',
  from: ADMIN,
  groupId: GROUP,
  epoch: 0,
  commit: 'Y29tbWl0',
  proposals: [],
  pskId: 'cHNr',
  pskNonce: 'bm9uY2U=',
  groupInfo: 'aW5mbw==',
  ratchetTree: '',
  treeDelta: [{ i: 2, n: 'AA' }],
  addedMembers: [MEMBER],
  removedMembers: [],
  consumedKeyPackages: [{ address: MEMBER, keyPackage: 'a3A=' }],
  welcomes: [
    {
      address: MEMBER,
      envelope: {
        welcome: 'd2VsY29tZQ==',
        ratchetTree: '',
        sealedPsk: { cipherText: 'Y3Q=', nonce: '', ct: 'cHNr', ...(over.sealed || {}) },
        pskId: 'cHNr',
        pskNonce: 'bm9uY2U=',
        epoch: 1,
        timestamp: T0,
        ...(over.env || {}),
      },
    },
  ],
  fee: FEE,
  timestamp: T0 + 1000,
  sign: { owner: ADMIN, sig: '00' },
  ...(over.tx || {}),
})

// Unsigned: a commit that clears every other rule stops at the signer check.
const fieldsReason = (tx: any): string => commit.validate_fields({ ...tx, sign: undefined }, fresh()).reason
const PAD = 'A'.repeat(70 * 1024)

describe('group_commit stores nothing it does not count', () => {
  test('an honest add gets past every size and shape rule', () => {
    expect(fieldsReason(addTx())).toBe('not signed by from account')
  })

  test.each([
    ['meta', { tx: { meta: PAD } }],
    ['pskNonce', { tx: { pskId: '', pskNonce: PAD } }],
    ['the sealed PSK', { sealed: { ct: PAD } }],
    ["the welcome's pskId", { env: { pskId: PAD } }],
    ["the welcome's pskNonce", { env: { pskNonce: PAD } }],
  ])('padding %s past 64 kB is refused', (_name, over) => {
    expect(fieldsReason(addTx(over as any))).toContain('commit payload exceeds 64 kB')
  })

  test('proposals outside the commit are refused', () => {
    expect(fieldsReason(addTx({ tx: { proposals: ['cHJvcG9zYWw='] } }))).toContain('"proposals" must be empty')
  })

  test('a welcome envelope carrying its own tree is refused', () => {
    expect(fieldsReason(addTx({ env: { ratchetTree: 'dHJlZQ==' } }))).toContain('must not carry a ratchet tree')
  })

  test('a pending welcome keeps only the envelope fields, not extras the sender added', async () => {
    const w = world()
    const tx = addTx({ env: { junk: 'A'.repeat(1000) } })
    await commit.apply(tx, tx.timestamp, 'c'.repeat(64), w.wrapped, dapp, {} as any)
    const stored = w.tree.pendingWelcomes[MEMBER] as any
    expect(stored.welcome).toBe('d2VsY29tZQ==')
    expect(stored.junk).toBeUndefined()
    expect(Object.keys(stored).sort()).toEqual(
      ['addedBy', 'epoch', 'pskCount', 'pskId', 'pskNonce', 'ratchetTree', 'sealedPsk', 'timestamp', 'welcome'].sort(),
    )
  })
})

describe('key package size', () => {
  const publishTx = (over: Record<string, unknown>): any => ({
    type: 'group_keypackage_publish',
    from: ADMIN,
    keyPackages: [],
    cipherSuite: 84,
    fee: FEE,
    timestamp: T0,
    ...over,
  })
  const reason = (over: Record<string, unknown>): string => publish.validate_fields(publishTx(over), fresh()).reason

  test('an honest-sized key package passes', () => {
    // 3,612 bytes of base64, measured for the client's X-Wing key package.
    expect(reason({ keyPackages: ['A'.repeat(3612)] })).not.toContain('at most')
  })

  test('a key package padded past 6 kB is refused, last resort included', () => {
    expect(reason({ keyPackages: ['A'.repeat(7 * 1024)] })).toBe('each key package must be at most 6144 bytes.')
    expect(reason({ keyPackages: ['A'.repeat(3612)], lastResortKeyPackage: 'A'.repeat(7 * 1024) })).toBe(
      'each key package must be at most 6144 bytes.',
    )
  })
})

describe('the tree account history budget', () => {
  const KB100 = 'A'.repeat(100_000)
  const handshake = (epoch: number): any => ({ type: 'group_commit', txId: String(epoch), from: ADMIN, groupId: GROUP, epoch, commit: KB100 })
  const welcome = (epoch: number): any => ({ welcome: 'd2VsY29tZQ==', ratchetTree: '', epoch, timestamp: T0 })
  const invitee = (n: number): string => n.toString(16).padStart(64, 'e')

  test('drops the oldest first, by the commit that wrote it, and a snapshot takes its welcomes', () => {
    const tree = groupTreeAccount(TREE(), GROUP)
    tree.handshakes = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(handshake)
    // Snapshot 3 was written by the commit recorded at handshake 2.
    tree.welcomeTrees = { '3': 'B'.repeat(200_000), '8': 'B'.repeat(200_000) }
    tree.pendingWelcomes = { [invitee(3)]: welcome(3), [invitee(8)]: welcome(8) } as any
    commit.trimTreeHistory(tree, 10, 1024 * 1024)
    // Handshakes 0-2 went first (2 and snapshot 3 share a commit; the handshake
    // goes before the snapshot), then snapshot 3 and its welcome.
    expect(tree.handshakes.map((h) => h.epoch)).toEqual([3, 4, 5, 6, 7, 8, 9])
    expect(Object.keys(tree.welcomeTrees)).toEqual(['8'])
    expect(Object.keys(tree.pendingWelcomes)).toEqual([invitee(8)])
  })

  test('never drops the commit just recorded or the snapshot it just took', () => {
    const tree = groupTreeAccount(TREE(), GROUP)
    tree.handshakes = [7, 8, 9].map(handshake)
    tree.welcomeTrees = { '10': 'B'.repeat(200_000) }
    tree.pendingWelcomes = { [invitee(10)]: welcome(10) } as any
    commit.trimTreeHistory(tree, 10, 0)
    expect(tree.handshakes.map((h) => h.epoch)).toEqual([9])
    expect(Object.keys(tree.welcomeTrees)).toEqual(['10'])
    expect(Object.keys(tree.pendingWelcomes)).toEqual([invitee(10)])
  })

  test('an admin inviting people who never join cannot grow the account past the budget', async () => {
    // A 300 kB tree: a 50-member tree is 105 kB, and a node may be twice honest size.
    mockTree = JSON.stringify(['C'.repeat(300_000)])
    try {
      const w = world()
      for (let n = 1; n <= 30; n++) {
        const who = invitee(n)
        w.wrapped[who] = { data: user(who) }
        const tx = addTx({ tx: { epoch: w.group.epoch, addedMembers: [who], consumedKeyPackages: [{ address: who, keyPackage: 'a3A=' }], timestamp: T0 + n * 1000 } })
        tx.welcomes[0].address = who
        await commit.apply(tx, tx.timestamp, n.toString(16).padStart(64, 'c'), w.wrapped, dapp, {} as any)
      }
      const out = new VectorBufferStream(0)
      serializeGroupTreeAccount(out, w.tree, true)
      // Budget, plus the live tree and small change. Thirty snapshots were ~9 MB.
      expect(out.getBuffer().length).toBeLessThan(config.LiberdusFlags.groupTreeHistoryBudgetBytes + 400_000)
      // The newest invitation still works; the oldest went with its snapshot.
      expect(w.tree.pendingWelcomes[invitee(30)]).toBeDefined()
      expect(w.tree.welcomeTrees[String(w.tree.pendingWelcomes[invitee(30)].epoch)]).toBeDefined()
      expect(w.tree.pendingWelcomes[invitee(1)]).toBeUndefined()
    } finally {
      mockTree = '[]'
    }
  })
})
