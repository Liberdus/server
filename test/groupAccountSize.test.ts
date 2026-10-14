import { VectorBufferStream } from '@shardus/core'
import { Utils } from '@shardus/lib-types'
import * as crypto from '../src/crypto'
import { groupAccount, serializeGroupAccount } from '../src/accounts/groupAccount'
import { groupTreeAccount } from '../src/accounts/groupTreeAccount'
import * as message from '../src/transactions/group_message'
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
jest.mock('../src/utils/mlsTree', () => ({
  replayCommit: jest.fn(async () => ({
    tree: '[]',
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
