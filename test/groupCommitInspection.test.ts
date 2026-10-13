import { randomBytes, webcrypto } from 'crypto'
import { Utils } from '@shardus/lib-types'
import { ShardusTypes } from '@shardus/core'
import * as crypto from '../src/crypto'
import * as mlsLib from '../src/vendor/ts-mls.js'
import { inspectCommit, CommitDeclaration } from '../src/utils/mlsCommit'
import { groupAccount } from '../src/accounts/groupAccount'
import { groupTreeAccount } from '../src/accounts/groupTreeAccount'
import { validate } from '../src/transactions/group_commit'
import * as AccountsStorage from '../src/storage/accountStorage'
import * as utils from '../src/utils'

/**
 * Threat model T1 and the structural half of T2: a commit must do exactly what
 * its sender declared.
 *
 * Every commit here is real MLS, built with the vendored bundle the client
 * ships, as a PublicMessage carrying the client's PSK proposal. The attacks are
 * the ones web-client-v2 test/commit-authority.mjs shows clients accepting: B,
 * an ordinary member, declares "no membership change" and commits an Add or a
 * Remove anyway.
 */

const mls = mlsLib as any
const SUITE = 'MLS_256_XWING_CHACHA20POLY1305_SHA512_Ed25519'
const FEE = 10n ** 16n
const A = 'a'.repeat(64) // founder and only admin
const B = 'b'.repeat(64) // ordinary member
const C = 'c'.repeat(64) // ordinary member
const D = 'd'.repeat(64) // outsider
const GROUP = '9'.repeat(64)

const te = new TextEncoder()
const b64 = (u: Uint8Array): string => Buffer.from(u).toString('base64')
const caps = { versions: ['mls10'], ciphersuites: [SUITE], extensions: [], proposals: [], credentials: ['basic'] }

let cs: any
const keyPackages: Record<string, any> = {}
let aState: any // A's state at epoch 1
let bState: any // B's state at epoch 1
let epoch0Tx: CommitDeclaration // A's commit adding B and C
let storedTree: string // the tree at epoch 1, as the network stores it
const groupAtEpoch1 = { mlsGroupId: GROUP, epoch: 1, admins: [A], createdBy: A, members: [A, B, C] }

/** The key package as the addee published it on chain. */
const published = (who: string): string =>
  b64(mls.encodeMlsMessage({ wireformat: 'mls_key_package', version: 'mls10', keyPackage: keyPackages[who].publicPackage }))

const treeWire = (tree: any[]): string => {
  const nodes = tree.map((n) => (n === undefined ? null : b64(mls.encodeNode(n))))
  while (nodes.length > 0 && nodes[nodes.length - 1] === null) nodes.pop()
  return JSON.stringify(nodes)
}

const leafOf = (state: any, who: string): number =>
  state.ratchetTree.findIndex(
    (n: any, i: number) => i % 2 === 0 && n && Buffer.from(n.leaf.credential.identity).toString() === who,
  ) / 2

const add = (who: string): any => ({ proposalType: 'add', add: { keyPackage: keyPackages[who].publicPackage } })
const remove = (who: string): any => ({ proposalType: 'remove', remove: { removed: leafOf(aState, who) } })

/** A commit as the client builds one: PublicMessage, plus a PSK proposal when it changes membership. */
const commit = async (state: any, proposals: any[], { publicMessage = true, withPsk = true } = {}): Promise<any> => {
  let pskIndex = mls.makePskIndex(undefined, {})
  const extra = [...proposals]
  let pskId = ''
  let pskNonce = ''
  if (withPsk) {
    const id = new Uint8Array(randomBytes(16))
    const nonce = new Uint8Array(randomBytes(cs.kdf.size))
    pskIndex = mls.makePskIndex(undefined, { [b64(id)]: new Uint8Array(randomBytes(cs.kdf.size)) })
    extra.push({ proposalType: 'psk', psk: { preSharedKeyId: { psktype: 'external', pskId: id, pskNonce: nonce } } })
    pskId = b64(id)
    pskNonce = b64(nonce)
  }
  const out = await mls.createCommit({ state, cipherSuite: cs, pskIndex }, { wireAsPublicMessage: publicMessage, extraProposals: extra })
  return { ...out, pskIndex, pskId, pskNonce }
}

const declare = (from: string, built: any, epoch: number, over: Partial<CommitDeclaration> = {}): CommitDeclaration => ({
  from,
  commit: b64(mls.encodeMlsMessage(built.commit)),
  epoch,
  addedMembers: [],
  removedMembers: [],
  consumedKeyPackages: [],
  pskId: built.pskId,
  pskNonce: built.pskNonce,
  ...over,
})

beforeAll(async () => {
  crypto.init('69fa4195670576c0160d660c3be36556ff8d504725be8a59b5a96509e0c994bc')
  crypto.setCustomStringifier(Utils.safeStringify, 'shardus_safeStringify')
  ;(AccountsStorage as any).cachedNetworkAccount = { current: { activeVersion: '1.0.0', transactionFee: FEE } }

  // Building commits needs WebCrypto, which jest 26's node environment does not
  // expose globally. Inspecting them does not; only these fixtures need it.
  if (!(globalThis as any).crypto) (globalThis as any).crypto = webcrypto
  cs = await mls.getCiphersuiteImpl(mls.getCiphersuiteFromName(SUITE))
  for (const who of [A, B, C, D]) {
    keyPackages[who] = await mls.generateKeyPackage({ credentialType: 'basic', identity: te.encode(who) }, caps, mls.defaultLifetime, [], cs)
  }

  const founded = await mls.createGroup(te.encode(GROUP), keyPackages[A].publicPackage, keyPackages[A].privatePackage, [], cs)
  const setup = await commit(founded, [add(B), add(C)])
  epoch0Tx = declare(A, setup, 0, {
    addedMembers: [B, C],
    consumedKeyPackages: [
      { address: B, keyPackage: published(B) },
      { address: C, keyPackage: published(C) },
    ],
  })
  aState = setup.newState
  bState = await mls.joinGroup(setup.welcome, keyPackages[B].publicPackage, keyPackages[B].privatePackage, setup.pskIndex, cs, aState.ratchetTree)
  storedTree = treeWire(aState.ratchetTree)
}, 120_000)

describe('inspectCommit', () => {
  test("the founder's first commit is accepted before any tree is stored", () => {
    const res = inspectCommit(epoch0Tx, { ...groupAtEpoch1, epoch: 0 }, '')
    expect(res).toEqual({ ok: true, effect: { senderLeaf: 0, added: [B, C], removed: [], departed: [], external: false } })
  })

  test('declaring fewer adds than the commit makes is refused', () => {
    const res = inspectCommit(
      { ...epoch0Tx, addedMembers: [B], consumedKeyPackages: epoch0Tx.consumedKeyPackages.slice(0, 1) },
      { ...groupAtEpoch1, epoch: 0 },
      '',
    )
    expect(res).toEqual({ ok: false, reason: 'commit adds a key package that was not declared.' })
  })

  test('T1: a member hiding an Add of an outsider is refused', async () => {
    const hidden = await commit(bState, [add(D)])
    const res = inspectCommit(declare(B, hidden, 1), groupAtEpoch1, storedTree)
    expect(res).toEqual({ ok: false, reason: 'commit adds a key package that was not declared.' })
  })

  test('T1: a member declaring the Add honestly is refused as a non-admin', async () => {
    const built = await commit(bState, [add(D)])
    const res = inspectCommit(
      declare(B, built, 1, { addedMembers: [D], consumedKeyPackages: [{ address: D, keyPackage: published(D) }] }),
      groupAtEpoch1,
      storedTree,
    )
    expect(res).toEqual({ ok: false, reason: 'only an admin may add or remove members.' })
  })

  test('T1: a member hiding a Remove is refused', async () => {
    const hidden = await commit(bState, [remove(C)])
    const res = inspectCommit(declare(B, hidden, 1), groupAtEpoch1, storedTree)
    expect(res).toEqual({ ok: false, reason: `commit removes [${C}] but declares [].` })
  })

  test('T3: any member may remove the leaf of someone who already left', async () => {
    // C left by group_leave: off the roster, leaf still in the tree.
    const built = await commit(bState, [remove(C)])
    const res = inspectCommit(declare(B, built, 1, { removedMembers: [C] }), { ...groupAtEpoch1, members: [A, B] }, storedTree)
    expect(res).toEqual({ ok: true, effect: { senderLeaf: leafOf(aState, B), added: [], removed: [C], departed: [C], external: false } })
  })

  test('removing a member still on the roster is still an admin call', async () => {
    const built = await commit(bState, [remove(C)])
    const res = inspectCommit(declare(B, built, 1, { removedMembers: [C] }), groupAtEpoch1, storedTree)
    expect(res).toEqual({ ok: false, reason: 'only an admin may add or remove members.' })
  })

  test('an admin removing a member, declared, is accepted', async () => {
    const built = await commit(aState, [remove(C)])
    const res = inspectCommit(declare(A, built, 1, { removedMembers: [C] }), groupAtEpoch1, storedTree)
    expect(res).toEqual({ ok: true, effect: { senderLeaf: 0, added: [], removed: [C], departed: [], external: false } })
  })

  test('a path-only update is open to any member', async () => {
    const built = await commit(bState, [], { withPsk: false })
    const res = inspectCommit(declare(B, built, 1), groupAtEpoch1, storedTree)
    expect(res).toEqual({ ok: true, effect: { senderLeaf: leafOf(aState, B), added: [], removed: [], departed: [], external: false } })
  })

  test("submitting another member's commit as your own is refused", async () => {
    const built = await commit(aState, [], { withPsk: false })
    const res = inspectCommit(declare(B, built, 1), groupAtEpoch1, storedTree)
    expect(res).toEqual({ ok: false, reason: 'commit is signed from a leaf that is not the sender.' })
  })

  test('a proposal type other than add, remove and psk is refused', async () => {
    const built = await commit(
      aState,
      [{ proposalType: 'group_context_extensions', groupContextExtensions: { extensions: [] } }],
      { withPsk: false },
    )
    const res = inspectCommit(declare(A, built, 1), groupAtEpoch1, storedTree)
    expect(res).toEqual({ ok: false, reason: 'commit carries a group_context_extensions proposal, which is not allowed.' })
  })

  test("an add whose key package names someone other than the account added is refused", async () => {
    // An account can publish a key package naming anyone; the roster would show
    // that name for the account the network admitted.
    const impostor = await mls.generateKeyPackage({ credentialType: 'basic', identity: te.encode(D) }, caps, mls.defaultLifetime, [], cs)
    const M = 'e'.repeat(64)
    const built = await commit(aState, [{ proposalType: 'add', add: { keyPackage: impostor.publicPackage } }])
    const declaredKp = b64(mls.encodeMlsMessage({ wireformat: 'mls_key_package', version: 'mls10', keyPackage: impostor.publicPackage }))
    const res = inspectCommit(
      declare(A, built, 1, { addedMembers: [M], consumedKeyPackages: [{ address: M, keyPackage: declaredKp }] }),
      groupAtEpoch1,
      storedTree,
    )
    expect(res).toEqual({ ok: false, reason: `the key package added for ${M} names someone else.` })
  })

  test("a declared pskId that does not match the commit's PSK proposal is refused", async () => {
    // Members step their PSK ratchet from the record, not the commit.
    const built = await commit(aState, [remove(C)])
    const other = b64(new Uint8Array(randomBytes(16)))
    const res = inspectCommit(declare(A, built, 1, { removedMembers: [C], pskId: other }), groupAtEpoch1, storedTree)
    expect(res).toEqual({ ok: false, reason: "commit's PSK proposal does not match the declared pskId and pskNonce." })
  })

  test('a PSK proposal with no declared pskId is refused', async () => {
    const built = await commit(aState, [remove(C)])
    const res = inspectCommit(declare(A, built, 1, { removedMembers: [C], pskId: '', pskNonce: '' }), groupAtEpoch1, storedTree)
    expect(res).toEqual({ ok: false, reason: 'commit carries a PSK proposal but declares no pskId.' })
  })

  test('a proposal carried by reference is refused', async () => {
    // A proposal sent as its own message sits in the sender's state, and the
    // next commit bundles it by reference. The network never saw that message,
    // so it cannot check what the reference points at.
    const proposed = await mls.createProposal(bState, false, remove(C), cs)
    const built = await commit(proposed.newState, [], { withPsk: false })
    const res = inspectCommit(declare(B, built, 1), groupAtEpoch1, storedTree)
    expect(res).toEqual({ ok: false, reason: 'commit carries a proposal by reference.' })
  })

  test('T2: bytes that are not MLS are refused', () => {
    const res = inspectCommit({ ...epoch0Tx, epoch: 1, commit: Buffer.from('not a commit at all').toString('base64') }, groupAtEpoch1, storedTree)
    expect(res).toEqual({ ok: false, reason: 'commit is not a decodable MLS message.' })
  })

  test('T2: a private-message commit is refused', async () => {
    const built = await commit(aState, [], { publicMessage: false, withPsk: false })
    const res = inspectCommit(declare(A, built, 1), groupAtEpoch1, storedTree)
    expect(res).toEqual({ ok: false, reason: 'commit must be an MLS public message, not mls_private_message.' })
  })

  test('a commit built on another epoch is refused', () => {
    const res = inspectCommit({ ...epoch0Tx, epoch: 1 }, groupAtEpoch1, storedTree)
    expect(res).toEqual({ ok: false, reason: 'commit is built on epoch 0; the group is at 1.' })
  })

  test('the commit is for this MLS group', () => {
    const res = inspectCommit(epoch0Tx, { ...groupAtEpoch1, epoch: 0, mlsGroupId: '8'.repeat(64) }, '')
    expect(res).toEqual({ ok: false, reason: 'commit is for a different MLS group.' })
  })
})

describe('group_commit validate runs the inspection', () => {
  const states = (groupOver: Record<string, unknown> = {}, senderBalance: bigint = FEE * 100n): any => {
    const group = groupAccount(
      GROUP,
      {
        from: A,
        groupId: GROUP,
        groupNonce: 'ab'.repeat(16),
        mlsGroupId: GROUP,
        cipherSuite: 84,
        meta: '',
        maxMembers: 20,
        joinFee: BigInt(0),
        fee: FEE,
      } as any,
      1_700_000_000_000,
    )
    Object.assign(group, { members: [A, B, C], admins: [A], epoch: 1, ...groupOver })
    const treeId = utils.calculateGroupTreeId(GROUP)
    const tree = groupTreeAccount(treeId, GROUP)
    tree.ratchetTree = storedTree
    const user = (id: string, balance = FEE * 100n): any => ({ id, type: 'UserAccount', data: { balance } })
    const out: Record<string, any> = {}
    for (const [id, data] of Object.entries({ [A]: user(A), [B]: user(B, senderBalance), [GROUP]: group, [treeId]: tree })) {
      out[id] = { accountId: id, stateId: '', data, timestamp: 0, accountCreated: false, isPartial: false }
    }
    return out
  }
  const runWith = (decl: CommitDeclaration, groupOver: Record<string, unknown>, senderBalance: bigint): ShardusTypes.IncomingTransactionResult =>
    validate(
      { type: 'group_commit', groupId: GROUP, proposals: [], welcomes: [], treeDelta: [], fee: FEE, ...decl } as any,
      states(groupOver, senderBalance),
      { success: false, reason: 'Tx Validation Fails', status: 400 } as any,
      undefined as never,
    )
  const run = (decl: CommitDeclaration): ShardusTypes.IncomingTransactionResult =>
    validate(
      { type: 'group_commit', groupId: GROUP, proposals: [], welcomes: [], treeDelta: [], fee: FEE, ...decl } as any,
      states(),
      { success: false, reason: 'Tx Validation Fails', status: 400 } as any,
      undefined as never,
    )

  test('T1: a hidden Remove from a non-admin is rejected, naming the real change', async () => {
    const hidden = await commit(bState, [remove(C)])
    const res = run(declare(B, hidden, 1))
    expect(res.success).toBe(false)
    expect(res.reason).toBe(`commit removes [${C}] but declares [].`)
  })

  test('T3: a member with an empty wallet removes the leaf of someone who left; the group pays', async () => {
    const built = await commit(bState, [remove(C)])
    const res = runWith(declare(B, built, 1, { removedMembers: [C] }), { members: [A, B], maintenanceBalance: FEE * 5n }, BigInt(0))
    expect(res.reason).toBe('This transaction is valid!')
  })

  test('a path-only update from a member passes', async () => {
    const built = await commit(bState, [], { withPsk: false })
    const res = run(declare(B, built, 1))
    expect(res.reason).toBe('This transaction is valid!')
    expect(res.success).toBe(true)
  })
})
