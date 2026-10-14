import { randomBytes, webcrypto } from 'crypto'
import { Utils } from '@shardus/lib-types'
import * as crypto from '../src/crypto'
import * as mlsLib from '../src/vendor/ts-mls.js'
import { replayCommit, treeToWire, MAX_TREE_NODE_BYTES } from '../src/utils/mlsTree'
import { inspectCommit } from '../src/utils/mlsCommit'
import { groupAccount } from '../src/accounts/groupAccount'
import { groupTreeAccount, serializeGroupTreeAccount, deserializeGroupTreeAccount } from '../src/accounts/groupTreeAccount'
import { SerdeTypeIdent } from '../src/accounts'
import { VectorBufferStream } from '@shardus/core'
import { apply } from '../src/transactions/group_commit'
import * as AccountsStorage from '../src/storage/accountStorage'
import * as utils from '../src/utils'

/**
 * Threat model T15 and T2: the ratchet tree the network stores is computed from
 * each commit, and each commit's signature is checked against the GroupContext
 * the network tracks, as members check it.
 *
 * Real MLS throughout, built with the vendored bundle clients ship. The anchor
 * for every "accepted" case is what an honest MEMBER holds after processing the
 * same commit: the network's tree and transcript must equal it.
 */

const mls = mlsLib as any
const SUITE = 'MLS_256_XWING_CHACHA20POLY1305_SHA512_Ed25519'
const SUITE_ID = 84
const FEE = 10n ** 16n
const A = 'a'.repeat(64) // founder and admin
const B = 'b'.repeat(64)
const C = 'c'.repeat(64)
const GROUP = '9'.repeat(64)

const te = new TextEncoder()
const b64 = (u: Uint8Array): string => Buffer.from(u).toString('base64')
const caps = { versions: ['mls10'], ciphersuites: [SUITE], extensions: [], proposals: [], credentials: ['basic'] }
const group = (epoch: number): any => ({ mlsGroupId: GROUP, epoch, cipherSuite: SUITE_ID, createdBy: A, members: [A, B, C] })

let cs: any
const kp: Record<string, any> = {}
let founded: any // A alone, epoch 0
let setup: any // A's commit adding B and C
let baseline: string // the client's founding tree, as it sends it today
let aState: any
let bState: any
let cState: any
let transcript1: any // the network's transcript after the founding commit

const leafOf = (state: any, who: string): number =>
  state.ratchetTree.findIndex(
    (n: any, i: number) => i % 2 === 0 && n && Buffer.from(n.leaf.credential.identity).toString() === who,
  ) / 2

/** The GroupInfo a client publishes for the epoch `state` is at: the recovery checkpoint. */
const checkpointOf = async (state: any): Promise<string> =>
  b64(mls.encodeMlsMessage({ wireformat: 'mls_group_info', version: 'mls10', groupInfo: await mls.createGroupInfoWithExternalPub(state, [], cs) }))

const commit = async (state: any, proposals: any[], withPsk = true): Promise<any> => {
  let pskIndex = mls.makePskIndex(undefined, {})
  const extra = [...proposals]
  if (withPsk) {
    const id = new Uint8Array(randomBytes(16))
    pskIndex = mls.makePskIndex(undefined, { [b64(id)]: new Uint8Array(randomBytes(cs.kdf.size)) })
    extra.push({
      proposalType: 'psk',
      psk: { preSharedKeyId: { psktype: 'external', pskId: id, pskNonce: new Uint8Array(randomBytes(cs.kdf.size)) } },
    })
  }
  const out = await mls.createCommit({ state, cipherSuite: cs, pskIndex }, { wireAsPublicMessage: true, extraProposals: extra })
  return { ...out, pskIndex, wire: b64(mls.encodeMlsMessage(out.commit)), groupInfo: await checkpointOf(out.newState) }
}

/** A replay input for `built`, as the client sends it. */
const input = (from: string, built: any, over: Record<string, unknown> = {}): any => ({
  from,
  commit: built.wire,
  ratchetTree: '',
  groupInfo: built.groupInfo,
  ...over,
})

/** What a member's client does with a commit it receives. */
const processAsMember = async (state: any, built: any): Promise<any> => {
  const message = mls.decodeMlsMessage(mls.encodeMlsMessage(built.commit), 0)[0]
  const r = await mls.processPublicMessage(state, message.publicMessage, built.pskIndex, cs, mls.acceptAll)
  return r.newState
}

/** The client's delta: every node that differs, by index. */
const delta = (before: string, after: string): { i: number; n: string | null }[] => {
  const x = JSON.parse(before || '[]')
  const y = JSON.parse(after)
  const out = []
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    if ((x[i] ?? null) !== (y[i] ?? null)) out.push({ i, n: y[i] ?? null })
  }
  return out
}

beforeAll(async () => {
  crypto.init('69fa4195670576c0160d660c3be36556ff8d504725be8a59b5a96509e0c994bc')
  crypto.setCustomStringifier(Utils.safeStringify, 'shardus_safeStringify')
  ;(AccountsStorage as any).cachedNetworkAccount = { current: { activeVersion: '1.0.0', transactionFee: FEE } }
  // WebCrypto is global in Node 20, but jest 26's environment does not expose it.
  if (!(globalThis as any).crypto) (globalThis as any).crypto = webcrypto
  cs = await mls.getCiphersuiteImpl(mls.getCiphersuiteFromName(SUITE))
  for (const who of [A, B, C]) {
    kp[who] = await mls.generateKeyPackage({ credentialType: 'basic', identity: te.encode(who) }, caps, mls.defaultLifetime, [], cs)
  }
  founded = await mls.createGroup(te.encode(GROUP), kp[A].publicPackage, kp[A].privatePackage, [], cs)
  setup = await commit(founded, [
    { proposalType: 'add', add: { keyPackage: kp[B].publicPackage } },
    { proposalType: 'add', add: { keyPackage: kp[C].publicPackage } },
  ])
  aState = setup.newState
  baseline = treeToWire(aState.ratchetTree)
  bState = await mls.joinGroup(setup.welcome, kp[B].publicPackage, kp[B].privatePackage, setup.pskIndex, cs, aState.ratchetTree)
  cState = await mls.joinGroup(setup.welcome, kp[C].publicPackage, kp[C].privatePackage, setup.pskIndex, cs, aState.ratchetTree)
  transcript1 = (await replayCommit('', null, founding(), group(0))).transcript
}, 120_000)

/** The founder's first commit as the client sends it. */
const founding = (over: Record<string, unknown> = {}): any => ({
  from: A,
  commit: setup.wire,
  ratchetTree: baseline,
  foundingConfirmationTag: b64(founded.confirmationTag),
  groupInfo: setup.groupInfo,
  ...over,
})

/** A member's GroupContext, in the network's transcript form. */
const asTranscript = (state: any, pskCount: number): any => ({
  epoch: Number(state.groupContext.epoch),
  treeHash: b64(state.groupContext.treeHash),
  confirmedTranscriptHash: b64(state.groupContext.confirmedTranscriptHash),
  confirmationTag: b64(state.confirmationTag),
  pskCount,
})

/** Re-encodes a commit after `edit` changes its decoded form. */
const tampered = (built: any, edit: (msg: any) => void): string => {
  const message = mls.decodeMlsMessage(mls.encodeMlsMessage(built.commit), 0)[0]
  edit(message)
  return b64(mls.encodeMlsMessage(message))
}

describe('replayCommit', () => {
  test("the founder's first commit: the tree and transcript are the ones members hold", async () => {
    const { tree, transcript } = await replayCommit('', null, founding(), group(0))
    expect(tree).toBe(baseline)
    expect(tree).toBe(treeToWire(bState.ratchetTree)) // and to what a joiner holds
    expect(transcript).toEqual(asTranscript(aState, 1))
    expect(transcript).toEqual(asTranscript(bState, 1))
  })

  test('a founding tree whose leaf 0 is someone else is refused', async () => {
    const forged = JSON.parse(baseline)
    forged[0] = forged[2] // B's leaf where the founder's should be
    await expect(replayCommit('', null, founding({ ratchetTree: JSON.stringify(forged) }), group(0))).rejects.toThrow(
      'leaf 0 of the founding tree is not the founder.',
    )
  })

  test('a first commit without the founding confirmation tag is refused', async () => {
    await expect(replayCommit('', null, founding({ foundingConfirmationTag: undefined }), group(0))).rejects.toThrow(
      "a group's first commit must carry the founding confirmation tag.",
    )
  })

  test('T2: a commit whose signature was altered is refused', async () => {
    const upd = await commit(bState, [], false)
    const wire = tampered(upd, (m) => {
      m.publicMessage.auth.signature[0] ^= 0xff
    })
    await expect(replayCommit(baseline, transcript1, input(B, { wire: wire, groupInfo: '' }), group(1))).rejects.toThrow(
      "the commit's signature does not verify.",
    )
  })

  test("T2: B's commit re-attributed to A's leaf is refused", async () => {
    const upd = await commit(bState, [], false)
    const wire = tampered(upd, (m) => {
      m.publicMessage.content.sender.leafIndex = leafOf(aState, A)
    })
    await expect(replayCommit(baseline, transcript1, input(A, { wire: wire, groupInfo: '' }), group(1))).rejects.toThrow(
      "the commit's signature does not verify.",
    )
  })

  test('a wrong founding tag is caught at the first commit: the checkpoint no longer matches', async () => {
    // The founder's GroupInfo carries the transcript hash their client derived
    // from the real tag, so a wrong tag cannot be sent alongside an honest one.
    const wrongTag = new Uint8Array(founded.confirmationTag.length) // all zeroes
    await expect(replayCommit('', null, founding({ foundingConfirmationTag: b64(wrongTag) }), group(0))).rejects.toThrow(
      'the published GroupInfo does not describe the epoch this commit creates.',
    )
  })

  test('a group with a tree but no transcript predates verification and is refused', async () => {
    const upd = await commit(bState, [], false)
    await expect(replayCommit(baseline, null, input(B, upd), group(1))).rejects.toThrow(
      'this group predates commit verification and cannot take new commits.',
    )
  })

  test('a chain of commits: after each, the transcript is what members hold', async () => {
    // B updates its path, then A removes C. Members process both; the network
    // replays both from its own state.
    const upd = await commit(bState, [], false)
    const r1 = await replayCommit(baseline, transcript1, input(B, upd), group(1))
    const a1 = await processAsMember(aState, upd)
    expect(r1.transcript).toEqual(asTranscript(a1, 1)) // a path update carries no PSK

    const rm = await commit(a1, [{ proposalType: 'remove', remove: { removed: leafOf(a1, C) } }])
    const r2 = await replayCommit(r1.tree, r1.transcript, input(A, rm), group(2))
    const b2 = await processAsMember(upd.newState, rm)
    expect(r2.tree).toBe(treeToWire(b2.ratchetTree))
    expect(r2.transcript).toEqual(asTranscript(b2, 2)) // the removal does
  })

  test("a member's path update: the network's tree is the one members hold afterwards", async () => {
    const upd = await commit(bState, [], false)
    const { tree } = await replayCommit(baseline, transcript1, input(B, upd), group(1))
    const aAfter = await processAsMember(aState, upd)
    expect(tree).toBe(treeToWire(aAfter.ratchetTree))
    expect(tree).toBe(treeToWire(upd.newState.ratchetTree))
  })

  test('an admin removing a member: the network blanks exactly what members blank', async () => {
    const rm = await commit(aState, [{ proposalType: 'remove', remove: { removed: leafOf(aState, C) } }])
    const { tree } = await replayCommit(baseline, transcript1, input(A, rm), group(1))
    const bAfter = await processAsMember(bState, rm)
    expect(tree).toBe(treeToWire(bAfter.ratchetTree))
  })

  test("a path whose new leaf claims another member's address is refused", async () => {
    // B builds from a copy of its state in which its own leaf says C. ts-mls
    // carries the credential into the new leaf and signs it with B's key.
    const bLeaf = leafOf(bState, B) * 2
    const forgedTree = bState.ratchetTree.slice()
    forgedTree[bLeaf] = {
      ...forgedTree[bLeaf],
      leaf: { ...forgedTree[bLeaf].leaf, credential: { credentialType: 'basic', identity: te.encode(C) } },
    }
    const forged = await commit({ ...bState, ratchetTree: forgedTree }, [], false)
    await expect(replayCommit(baseline, transcript1, input(B, forged), group(1))).rejects.toThrow(
      "the commit's new leaf does not carry the sender's address.",
    )
    // And the cheap check in validate() refuses it before it costs anything.
    const res = inspectCommit(
      { from: B, commit: forged.wire, epoch: 1, addedMembers: [], removedMembers: [], consumedKeyPackages: [] },
      { mlsGroupId: GROUP, epoch: 1, admins: [A], createdBy: A, members: [A, B, C] },
      baseline,
    )
    expect(res).toEqual({ ok: false, reason: "commit's new leaf does not carry the sender's address." })
  })

  test('a Remove stripped of its UpdatePath is refused', async () => {
    // Our bundle will not build a Remove without a path (RFC 9420 s12.4, patched
    // in), so the only way to get one is to strip it after signing -- which the
    // signature check catches before the path rule is reached.
    const rm = await commit(aState, [{ proposalType: 'remove', remove: { removed: leafOf(aState, C) } }])
    const stripped = tampered(rm, (m) => {
      delete m.publicMessage.content.commit.path
    })
    await expect(replayCommit(baseline, transcript1, input(A, { wire: stripped, groupInfo: '' }), group(1))).rejects.toThrow(
      "the commit's signature does not verify.",
    )
  })
})

describe('tree node size (T7)', () => {
  // A private-use extension type; ts-mls accepts any listed in the leaf's capabilities.
  const PAD_TYPE = 0xf0a1
  const padded = { extensionType: PAD_TYPE, extensionData: new Uint8Array(40_000) }
  const D = 'd'.repeat(64)

  test('an add whose key package carries a padded leaf is refused', async () => {
    const big = await mls.generateKeyPackage(
      { credentialType: 'basic', identity: te.encode(D) },
      { ...caps, extensions: [PAD_TYPE] },
      mls.defaultLifetime,
      [],
      cs,
      [padded],
    )
    const add = await commit(aState, [{ proposalType: 'add', add: { keyPackage: big.publicPackage } }])
    await expect(replayCommit(baseline, transcript1, input(A, add), group(1))).rejects.toThrow(/ratchet tree node 6 is \d+ bytes/)
  })

  test("a path update whose new leaf is padded is refused", async () => {
    // As with the forged credential above: ts-mls carries B's leaf into the new
    // one, extensions and all, and signs it with B's key.
    const bLeaf = leafOf(bState, B) * 2
    const paddedTree = bState.ratchetTree.slice()
    const leaf = paddedTree[bLeaf].leaf
    paddedTree[bLeaf] = {
      ...paddedTree[bLeaf],
      leaf: { ...leaf, capabilities: { ...leaf.capabilities, extensions: [PAD_TYPE] }, extensions: [padded] },
    }
    const upd = await commit({ ...bState, ratchetTree: paddedTree }, [], false)
    await expect(replayCommit(baseline, transcript1, input(B, upd), group(1))).rejects.toThrow(
      new RegExp(`ratchet tree node ${bLeaf} is \\d+ bytes`),
    )
  })

  test('an honest add is well inside the limit', async () => {
    const honest = await mls.generateKeyPackage({ credentialType: 'basic', identity: te.encode(D) }, caps, mls.defaultLifetime, [], cs)
    const add = await commit(aState, [{ proposalType: 'add', add: { keyPackage: honest.publicPackage } }])
    const { tree } = await replayCommit(baseline, transcript1, input(A, add), group(1))
    const largest = Math.max(...JSON.parse(tree).map((n: string | null) => (n ? Buffer.from(n, 'base64').length : 0)))
    expect(largest).toBeLessThan(MAX_TREE_NODE_BYTES / 2 + 100)
  })
})

describe('the checkpoint every commit publishes (T18)', () => {
  test('a commit without a GroupInfo is refused', async () => {
    const upd = await commit(bState, [], false)
    await expect(replayCommit(baseline, transcript1, input(B, upd, { groupInfo: '' }), group(1))).rejects.toThrow(
      'commit must publish the GroupInfo for its new epoch.',
    )
  })

  test("a GroupInfo for the epoch before, not the epoch the commit creates, is refused", async () => {
    const upd = await commit(bState, [], false)
    await expect(
      replayCommit(baseline, transcript1, input(B, upd, { groupInfo: await checkpointOf(bState) }), group(1)),
    ).rejects.toThrow('the published GroupInfo does not describe the epoch this commit creates.')
  })

  test("another member's GroupInfo for the same epoch is refused", async () => {
    // C processes B's commit and publishes its own GroupInfo for the new epoch:
    // right context and tag, wrong signer.
    const upd = await commit(bState, [], false)
    const cAfter = await processAsMember(cState, upd)
    await expect(
      replayCommit(baseline, transcript1, input(B, upd, { groupInfo: await checkpointOf(cAfter) }), group(1)),
    ).rejects.toThrow('the published GroupInfo is not signed by the committer.')
  })
})

describe('rejoining by external commit (resync)', () => {
  /** C's device is out of step: it rejoins from the epoch-1 checkpoint, as the client will. */
  const rejoin = async (who: string, resync = true): Promise<any> => {
    // The client's MLS signature key is derived from the account, so a rejoining
    // device presents the same key it had; that is how ts-mls finds the former
    // leaf to remove.
    const sigKeyPair = { signKey: kp[who].privatePackage.signaturePrivateKey, publicKey: kp[who].publicPackage.leafNode.signaturePublicKey }
    const fresh = await mls.generateKeyPackageWithKey({ credentialType: 'basic', identity: te.encode(who) }, caps, mls.defaultLifetime, [], sigKeyPair, cs)
    const groupInfo = mls.decodeMlsMessage(Buffer.from(setup.groupInfo, 'base64'), 0)[0].groupInfo
    const out = await mls.joinGroupExternal(groupInfo, fresh.publicPackage, fresh.privatePackage, resync, cs, aState.ratchetTree)
    const wire = b64(mls.encodeMlsMessage({ wireformat: 'mls_public_message', version: 'mls10', publicMessage: out.publicMessage }))
    return { wire, newState: out.newState, groupInfo: await checkpointOf(out.newState), pskIndex: mls.makePskIndex(undefined, {}), commit: { wireformat: 'mls_public_message', version: 'mls10', publicMessage: out.publicMessage } }
  }

  test("a member's rejoin: accepted, and the network's tree and transcript are what the others hold", async () => {
    const r = await rejoin(C)
    const result = await replayCommit(baseline, transcript1, input(C, r), group(1))
    expect(result.external).toBe(true)
    const aAfter = await processAsMember(aState, r)
    expect(result.tree).toBe(treeToWire(aAfter.ratchetTree))
    expect(result.tree).toBe(treeToWire(r.newState.ratchetTree))
    expect(result.transcript).toEqual(asTranscript(aAfter, 1)) // carries no PSK
  })

  test('an outsider cannot use the public checkpoint to join', async () => {
    const r = await rejoin(C)
    await expect(replayCommit(baseline, transcript1, input(C, r), { ...group(1), members: [A, B] })).rejects.toThrow(
      'only a member of the group can rejoin it by external commit.',
    )
  })

  test('a rejoin that keeps the former leaf as well is refused', async () => {
    const r = await rejoin(C, false)
    await expect(replayCommit(baseline, transcript1, input(C, r), group(1))).rejects.toThrow(
      "an external commit must remove the sender's former leaf.",
    )
  })
})

describe('group_commit apply stores the computed tree', () => {
  const run = async (tx: any): Promise<any> => {
    const g = groupAccount(
      GROUP,
      { from: A, groupId: GROUP, groupNonce: 'ab'.repeat(16), mlsGroupId: GROUP, cipherSuite: SUITE_ID, meta: '', maxMembers: 20, joinFee: BigInt(0), fee: FEE } as any,
      1_700_000_000_000,
    )
    Object.assign(g, { members: [A, B, C], admins: [A], epoch: 1 })
    const tree = groupTreeAccount(utils.calculateGroupTreeId(GROUP), GROUP)
    tree.ratchetTree = baseline
    tree.transcript = transcript1
    const user = (id: string): any => ({ id, type: 'UserAccount', hash: '', timestamp: 0, data: { balance: FEE * 100n, chats: {} } })
    const wrapped: any = {
      [A]: { data: user(A) },
      [B]: { data: user(B) },
      [GROUP]: { data: g },
      [utils.calculateGroupTreeId(GROUP)]: { data: tree },
    }
    const dapp: any = { log: () => undefined, applyResponseAddReceiptData: () => undefined }
    await apply(tx, 1_700_000_200_000, 'tx-id', wrapped, dapp, {} as any)
    return tree
  }
  const txFor = (from: string, built: any, treeDelta: any[]): any => ({
    type: 'group_commit',
    from,
    groupId: GROUP,
    epoch: 1,
    commit: built.wire,
    proposals: [],
    pskId: '',
    pskNonce: '',
    groupInfo: built.groupInfo,
    ratchetTree: '',
    treeDelta,
    addedMembers: [],
    removedMembers: [],
    welcomes: [],
    consumedKeyPackages: [],
    fee: FEE,
    timestamp: 1_700_000_100_000,
    sign: { owner: from, sig: '00' },
  })

  test('an honest delta is accepted and the stored tree is what members hold', async () => {
    const upd = await commit(bState, [], false)
    const after = treeToWire(upd.newState.ratchetTree)
    const tree = await run(txFor(B, upd, delta(baseline, after)))
    expect(tree.ratchetTree).toBe(after)
    const cAfter = await processAsMember(cState, upd)
    expect(tree.ratchetTree).toBe(treeToWire(cAfter.ratchetTree))
    expect(tree.transcript).toEqual(asTranscript(cAfter, 1))
  })

  test('T15: a delta that writes a leaf the commit does not is refused', async () => {
    const upd = await commit(bState, [], false)
    const honest = delta(baseline, treeToWire(upd.newState.ratchetTree))
    // Same commit, plus a write that puts B's leaf where C's is.
    const poisoned = [...honest, { i: leafOf(bState, C) * 2, n: JSON.parse(baseline)[leafOf(bState, B) * 2] }]
    await expect(run(txFor(B, upd, poisoned))).rejects.toThrow('the ratchet tree this commit claims does not match the commit.')
  })
})

describe('removing the leaf of a member who left (T3)', () => {
  // C has left by group_leave: off the roster, leaf still in the tree.
  const run = async (tx: any): Promise<any> => {
    const g = groupAccount(
      GROUP,
      { from: A, groupId: GROUP, groupNonce: 'ab'.repeat(16), mlsGroupId: GROUP, cipherSuite: SUITE_ID, meta: '', maxMembers: 20, joinFee: BigInt(0), fee: FEE } as any,
      1_700_000_000_000,
    )
    Object.assign(g, { members: [A, B], admins: [A], epoch: 1, maintenanceBalance: FEE * 5n })
    const tree = groupTreeAccount(utils.calculateGroupTreeId(GROUP), GROUP)
    tree.ratchetTree = baseline
    tree.transcript = transcript1
    // C's join fee is still vesting when C leaves.
    tree.vestedFees = [{ admin: A, member: C, amount: FEE * 3n, vestingUntil: 1_800_000_000_000 }]
    const user = (id: string, balance: bigint): any => ({ id, type: 'UserAccount', hash: '', timestamp: 0, data: { balance, chats: {} } })
    const wrapped: any = {
      [A]: { data: user(A, FEE * 100n) },
      [B]: { data: user(B, BigInt(0)) }, // an empty wallet: the group pays
      [C]: { data: user(C, BigInt(0)) },
      [GROUP]: { data: g },
      [utils.calculateGroupTreeId(GROUP)]: { data: tree },
    }
    const dapp: any = { log: () => undefined, applyResponseAddReceiptData: () => undefined }
    await apply(tx, 1_700_000_200_000, 'tx-id', wrapped, dapp, {} as any)
    return { group: g, tree, b: wrapped[B].data, c: wrapped[C].data }
  }

  test('any member may remove it, the group pays, and the leaver is not refunded', async () => {
    const rm = await commit(bState, [{ proposalType: 'remove', remove: { removed: leafOf(bState, C) } }])
    const after = treeToWire(rm.newState.ratchetTree)
    const { group: g, tree, b, c } = await run({
      type: 'group_commit',
      from: B,
      groupId: GROUP,
      epoch: 1,
      commit: rm.wire,
      proposals: [],
      pskId: '',
      pskNonce: '',
      groupInfo: rm.groupInfo,
      ratchetTree: '',
      treeDelta: delta(baseline, after),
      addedMembers: [],
      removedMembers: [C],
      welcomes: [],
      consumedKeyPackages: [],
      fee: FEE,
      timestamp: 1_700_000_100_000,
      sign: { owner: B, sig: '00' },
    })
    expect(tree.ratchetTree).toBe(after) // C's leaf is gone
    expect(g.maintenanceBalance).toBe(FEE * 4n) // the group paid the fee
    expect(b.data.balance).toBe(BigInt(0)) // B paid nothing
    expect(c.data.balance).toBe(BigInt(0)) // no refund for leaving
    expect(tree.vestedFees).toHaveLength(1) // still the admin's once it vests
    expect(g.members).toEqual([A, B])
  })
})

describe('GroupTreeAccount serialization', () => {
  test('the transcript survives a round trip', () => {
    const tree = groupTreeAccount(utils.calculateGroupTreeId(GROUP), GROUP)
    tree.ratchetTree = baseline
    tree.transcript = transcript1
    const out = new VectorBufferStream(0)
    serializeGroupTreeAccount(out, tree, true)
    const back = deserializeGroupTreeAccount(VectorBufferStream.fromBuffer(out.getBuffer()), true)
    expect(back.transcript).toEqual(transcript1)
    expect(back.ratchetTree).toBe(baseline)
  })

  test('a buffer written before the field existed decodes with no transcript', () => {
    // The old layout, stopping where the old serializer did. Without the
    // end-of-buffer check this would read past the end and every existing
    // group tree would fail to load.
    const tree = groupTreeAccount(utils.calculateGroupTreeId(GROUP), GROUP)
    const old = new VectorBufferStream(0)
    old.writeUInt16(SerdeTypeIdent.GroupTreeAccount)
    old.writeString(tree.id)
    old.writeString(tree.type)
    old.writeString(tree.hash)
    old.writeBigUInt64(BigInt(tree.timestamp))
    old.writeString(tree.groupId)
    old.writeString(baseline)
    old.writeUInt32(1)
    for (const field of [tree.handshakes, tree.pendingWelcomes, tree.welcomeTrees, tree.pendingJoinRequests, tree.vestedFees, tree.checkpoint]) {
      old.writeString(Utils.safeStringify(field))
    }
    const back = deserializeGroupTreeAccount(VectorBufferStream.fromBuffer(old.getBuffer()), true)
    expect(back.transcript).toBeNull()
    expect(back.ratchetTree).toBe(baseline)
    expect(back.treeEpoch).toBe(1)
  })
})
