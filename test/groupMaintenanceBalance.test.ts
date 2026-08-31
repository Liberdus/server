import { VectorBufferStream } from '@shardus/core'
import * as crypto from '../src/crypto'
import { Utils } from '@shardus/lib-types'
import { groupAccount, serializeGroupAccount, deserializeGroupAccount } from '../src/accounts/groupAccount'
import { SerdeTypeIdent } from '../src/accounts'
import { validatePreCrack } from '../src/transactions/group_commit'
import * as AccountsStorage from '../src/storage/accountStorage'
import * as config from '../src/config'
import { GroupAccount } from '../src/@types'
import { ShardusTypes } from '@shardus/core'

/**
 * The group's maintenance balance: what funds it, and that it survives a
 * serialization round trip -- including from a buffer written before the field
 * existed, which must decode as an unfunded group rather than throwing.
 */

const FEE = 10n ** 16n
const MULT = BigInt(config.LiberdusFlags.groupRepairDepositMultiplier)
const ADMIN = '1'.repeat(64)
const MEMBER = '2'.repeat(64)
const JOINER = '3'.repeat(64)
const JOINER2 = '4'.repeat(64)
const GROUP = '9'.repeat(64)

beforeAll(() => {
  // groupAccount() hashes itself and derives the tree id, both of which need
  // the crypto module keyed. Same key the app and the other suites use.
  crypto.init('69fa4195670576c0160d660c3be36556ff8d504725be8a59b5a96509e0c994bc')
  // hashObj walks the account, which holds bigints; the app installs the same
  // BigInt-aware stringifier at startup (src/index.ts).
  crypto.setCustomStringifier(Utils.safeStringify, 'shardus_safeStringify')
  ;(AccountsStorage as any).cachedNetworkAccount = {
    current: { activeVersion: '1.0.0', transactionFee: FEE },
  }
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
      meta: 'encrypted-meta',
      maxMembers: 20,
      joinFee: BigInt(0),
      fee: FEE,
    } as any,
    1_700_000_000_000,
  )

const wrap = (accounts: Record<string, any>): any => {
  const out: Record<string, any> = {}
  for (const [id, data] of Object.entries(accounts)) {
    out[id] = { accountId: id, stateId: '', data, timestamp: 0, accountCreated: false, isPartial: false }
  }
  return out
}

const runPreCrack = (tx: any, states: any): ShardusTypes.IncomingTransactionResult =>
  validatePreCrack(
    tx,
    states,
    { success: false, reason: 'Tx Validation Fails', status: 400 } as unknown as ShardusTypes.IncomingTransactionResult,
    undefined as never,
  )

const commitTx = (over: Record<string, unknown> = {}): any => ({
  type: 'group_commit',
  from: ADMIN,
  groupId: GROUP,
  epoch: 0,
  addedMembers: [],
  removedMembers: [],
  fee: FEE,
  ...over,
})

const groupAt = (epoch: number, admins = [ADMIN]): any => ({
  id: GROUP,
  type: 'GroupAccount',
  members: [ADMIN, MEMBER],
  admins,
  epoch,
})

const user = (id: string, balance: bigint): any => ({ id, type: 'UserAccount', data: { balance } })

describe('a new group starts unfunded', () => {
  test('maintenanceBalance is zero at creation', () => {
    expect(makeGroup().maintenanceBalance).toBe(BigInt(0))
  })
})

describe('the repair deposit is charged for added members', () => {
  const states = (balance: bigint): any => wrap({ [ADMIN]: user(ADMIN, balance), [GROUP]: groupAt(0) })

  test('an admin who can cover fee plus one deposit passes', () => {
    const needed = FEE + FEE * MULT
    expect(runPreCrack(commitTx({ addedMembers: [JOINER] }), states(needed)).success).toBe(true)
  })

  test('an admin one wei short of fee plus deposit is rejected', () => {
    const needed = FEE + FEE * MULT
    const res = runPreCrack(commitTx({ addedMembers: [JOINER] }), states(needed - 1n))
    expect(res.success).toBe(false)
    expect(res.reason).toContain('repair deposit')
  })

  test('the deposit scales with the number of members added', () => {
    // Enough for one joiner, not for two.
    const oneJoiner = FEE + FEE * MULT
    const res = runPreCrack(commitTx({ addedMembers: [JOINER, JOINER2] }), states(oneJoiner))
    expect(res.success).toBe(false)
    expect(res.reason).toContain('repair deposit')

    const twoJoiners = FEE + FEE * MULT * 2n
    expect(runPreCrack(commitTx({ addedMembers: [JOINER, JOINER2] }), states(twoJoiners)).success).toBe(true)
  })

  test('a commit that adds nobody owes no deposit', () => {
    // A plain rekey or a removal only needs the fee itself.
    const res = runPreCrack(commitTx({ from: MEMBER }), wrap({ [MEMBER]: user(MEMBER, FEE), [GROUP]: groupAt(0) }))
    expect(res.success).toBe(true)
  })
})

describe('serialization', () => {
  test('a funded balance survives a round trip', () => {
    const group = makeGroup()
    group.maintenanceBalance = FEE * 7n

    const out = new VectorBufferStream(0)
    serializeGroupAccount(out, group, true)
    const back = deserializeGroupAccount(VectorBufferStream.fromBuffer(out.getBuffer()), true)

    expect(back.maintenanceBalance).toBe(FEE * 7n)
    // and nothing ahead of the new field shifted
    expect(back.id).toBe(group.id)
    expect(back.epoch).toBe(group.epoch)
    expect(back.members).toEqual(group.members)
    expect(back.joinFee).toBe(group.joinFee)
    expect(back.createdBy).toBe(group.createdBy)
    expect(back.hasChats).toBe(group.hasChats)
  })

  test('a buffer written before the field existed decodes as unfunded', () => {
    // The old layout, field for field, stopping where the old serializer did.
    // This is the case that would otherwise read past the end and throw,
    // making existing groups unloadable rather than merely unfunded.
    const group = makeGroup()
    const old = new VectorBufferStream(0)
    old.writeUInt16(SerdeTypeIdent.GroupAccount)
    old.writeString(group.id)
    old.writeString(group.type)
    old.writeString(group.hash)
    old.writeBigUInt64(BigInt(group.timestamp))
    old.writeString(group.mlsGroupId)
    old.writeUInt16(group.cipherSuite)
    old.writeUInt32(group.epoch)
    old.writeUInt32(group.members.length)
    for (const m of group.members) old.writeString(m)
    old.writeUInt32(group.admins.length)
    for (const a of group.admins) old.writeString(a)
    old.writeString(Utils.safeStringify(group.memberSince))
    old.writeString(Utils.safeStringify(group.messages))
    old.writeString(Utils.safeStringify(group.lastMessageAt))
    old.writeString(group.treeId)
    old.writeString(group.joinFee.toString())
    old.writeString(Utils.safeStringify(group.blocked))
    old.writeString(group.meta)
    old.writeUInt32(group.maxMembers)
    old.writeString(group.createdBy)
    old.writeUInt8(group.hasChats ? 1 : 0)
    // ...and no maintenanceBalance.

    const back = deserializeGroupAccount(VectorBufferStream.fromBuffer(old.getBuffer()), true)
    expect(back.maintenanceBalance).toBe(BigInt(0))
    expect(back.id).toBe(group.id)
    expect(back.createdBy).toBe(group.createdBy)
    expect(back.maxMembers).toBe(group.maxMembers)
  })
})
