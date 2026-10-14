/**
 * The ratchet tree after a commit, computed by the network rather than taken
 * from the committer.
 *
 * Joiners receive their ratchet tree from GroupTreeAccount. It used to be
 * advanced by the committer's own `treeDelta`, which nothing checked, so a
 * member could write leaves that did not match the group: joins then fail on
 * the tree-hash check, and inspectCommit, which reads leaf identities from this
 * tree, could be misled (threat model T15).
 *
 * Commits are public, so the network can take the same steps a member takes in
 * ts-mls processCommit -- check the signature against the group's context,
 * validate the proposals, apply removes and adds, validate the committer's new
 * leaf, apply the UpdatePath, derive the next context -- and stop before the
 * confirmation tag, which needs group secrets. The context is tracked in
 * GroupTreeAccount.transcript. It runs ts-mls's own functions from the vendored
 * bundle; nothing here re-implements MLS.
 *
 * Deterministic: no clock (key-package lifetimes are checked only when
 * `validateLifetimeOnReceive` is set, and it is not), no randomness. Async only
 * because ts-mls verifies signatures through WebCrypto, which is why this runs
 * in apply() rather than validate().
 */
import * as mlsLib from '../vendor/ts-mls.js'
import { GroupTranscript } from '../@types'

const mls = mlsLib as any
const textEncoder = new TextEncoder()
const textDecoder = new TextDecoder()

export interface ReplayInput {
  from: string
  commit: string
  ratchetTree: string // the client's baseline; only read on a group's first commit
  foundingConfirmationTag?: string // b64; only read on a group's first commit
  groupInfo: string // b64 MLSMessage(GroupInfo) for the new epoch: the recovery checkpoint
}

export interface ReplayResult {
  tree: string
  transcript: GroupTranscript
  /** A member rejoining by external commit, rather than a member's own commit. */
  external: boolean
}

export interface ReplayGroup {
  mlsGroupId: string
  epoch: number
  cipherSuite: number
  createdBy: string
  members: string[]
}

const ciphersuiteImpls = new Map<number, Promise<any>>()

const ciphersuiteFor = (id: number): Promise<any> => {
  let impl = ciphersuiteImpls.get(id)
  if (!impl) {
    const name = Object.keys(mls.ciphersuites).find((key) => mls.ciphersuites[key] === id)
    if (!name) throw new Error(`unknown MLS ciphersuite ${id}`)
    impl = mls.getCiphersuiteImpl(mls.getCiphersuiteFromName(name))
    ciphersuiteImpls.set(id, impl)
  }
  return impl
}

/** Stored wire form -> ts-mls tree. Same as the client's treeFromWire. */
const treeFromWire = (wire: string): any[] => {
  const nodes = JSON.parse(wire)
  if (!Array.isArray(nodes)) throw new Error('stored ratchet tree is not an array')
  return mls.extendRatchetTree(
    nodes.map((blob: string | null) => (blob === null ? undefined : mls.decodeNode(Buffer.from(blob, 'base64'), 0)[0])),
  )
}

/** ts-mls tree -> stored wire form. Same as the client's treeToWire, trailing blanks trimmed. */
export const treeToWire = (tree: any[]): string => {
  const nodes = tree.map((node) => (node === undefined ? null : Buffer.from(mls.encodeNode(node)).toString('base64')))
  while (nodes.length > 0 && nodes[nodes.length - 1] === null) nodes.pop()
  return JSON.stringify(nodes)
}

const leafAddress = (leafNode: any): string => textDecoder.decode(leafNode.credential.identity)

/**
 * The most one encoded ratchet-tree node may be, in bytes.
 *
 * Every node is member-supplied -- a leaf from a key package or an UpdatePath,
 * a parent's key from an UpdatePath -- and ts-mls accepts a leaf carrying any
 * extension. The tree is stored once live and again for each epoch with a
 * pending welcome, so one padded leaf costs many times its size (threat model
 * T7). Measured honest sizes: a leaf ~1,470 bytes, a parent ~1,290 plus 4 per
 * unmerged leaf, so 3 kB is about twice the largest.
 *
 * A constant rather than a config flag so this module stays free of server
 * imports, as mlsCommit.ts is.
 */
export const MAX_TREE_NODE_BYTES = 3 * 1024

/** Refuses a tree holding a node larger than MAX_TREE_NODE_BYTES. Checked on the computed tree, so it covers every source. */
const checkNodeSizes = (tree: any[]): void => {
  tree.forEach((node, index) => {
    if (node === undefined) return
    const size = mls.encodeNode(node).length
    if (size > MAX_TREE_NODE_BYTES) {
      throw new Error(`ratchet tree node ${index} is ${size} bytes; a node may be at most ${MAX_TREE_NODE_BYTES}.`)
    }
  })
}

const b64 = (bytes: Uint8Array): string => Buffer.from(bytes).toString('base64')
const fromB64 = (value: string): Uint8Array => new Uint8Array(Buffer.from(value, 'base64'))

const fail = (err: unknown): never => {
  throw err instanceof Error ? err : new Error(String(err))
}

const sameBytes = (a: Uint8Array, b: Uint8Array): boolean =>
  a instanceof Uint8Array && b instanceof Uint8Array && a.length === b.length && a.every((v, i) => v === b[i])

/** Proposals grouped exactly as ts-mls applyProposals groups them. */
const groupProposals = (proposals: any[], senderLeafIndex: number | undefined): any =>
  proposals.reduce((acc: any, entry: any) => {
    const type = entry.proposal.proposalType
    return { ...acc, [type]: [...(acc[type] ?? []), { proposal: entry.proposal, senderLeafIndex }] }
  }, mls.emptyProposals)

/**
 * The tree before a group's first commit: the founder alone, at leaf 0.
 *
 * Nothing has been stored yet, and the first commit usually carries no
 * UpdatePath, so the founder's leaf is taken from the client's baseline -- the
 * one leaf that existed before the commit. Only the founder can commit at epoch
 * 0, so the leaf they present for themselves is the only thing taken on trust,
 * and it must carry their address. Every other node is then computed.
 */
const foundingTree = (baseline: string, group: ReplayGroup): any[] => {
  if (baseline.length === 0) throw new Error("a group's first commit must carry the founding tree.")
  const founder = treeFromWire(baseline)[0]
  if (!founder || founder.nodeType !== 'leaf') throw new Error('the founding tree has no leaf 0.')
  if (leafAddress(founder.leaf) !== group.createdBy) throw new Error('leaf 0 of the founding tree is not the founder.')
  return mls.extendRatchetTree([founder])
}

/**
 * The GroupContext the commit was built on, and the confirmation tag of that
 * epoch, from the transcript the network keeps.
 *
 * Before a group's first commit there is no transcript. Epoch 0's context is
 * public (the founding tree's hash, an empty transcript hash), but its
 * confirmation tag comes from the founder's secrets, so the founder sends it.
 * Like the founding leaf, it is taken on the founder's word: a wrong one makes
 * the chain diverge and every later commit in that group fail its signature
 * check, which only the founder's own group pays for.
 */
const currentEpoch = async (
  transcript: GroupTranscript | null,
  tree: any[],
  tx: ReplayInput,
  group: ReplayGroup,
  cs: any,
): Promise<{ context: any; confirmationTag: Uint8Array; pskCount: number }> => {
  const base = {
    version: 'mls10',
    cipherSuite: cs.name,
    groupId: textEncoder.encode(group.mlsGroupId),
    epoch: BigInt(group.epoch),
    extensions: [],
  }
  if (transcript === null) {
    if (group.epoch !== 0) throw new Error('this group predates commit verification and cannot take new commits.')
    if (typeof tx.foundingConfirmationTag !== 'string' || tx.foundingConfirmationTag.length === 0) {
      throw new Error("a group's first commit must carry the founding confirmation tag.")
    }
    return {
      context: { ...base, treeHash: await mls.treeHashRoot(tree, cs.hash), confirmedTranscriptHash: new Uint8Array() },
      confirmationTag: fromB64(tx.foundingConfirmationTag),
      pskCount: 0,
    }
  }
  if (transcript.epoch !== group.epoch) throw new Error('stored transcript is not at the group epoch.')
  return {
    context: { ...base, treeHash: fromB64(transcript.treeHash), confirmedTranscriptHash: fromB64(transcript.confirmedTranscriptHash) },
    confirmationTag: fromB64(transcript.confirmationTag),
    pskCount: transcript.pskCount ?? 0,
  }
}

/**
 * Applies `tx.commit` to the stored tree and transcript.
 *
 * Two kinds of commit reach here: a member's own (sender type `member`), and a
 * member rejoining by external commit (`new_member_commit`) because their
 * device fell out of step -- RFC 9420 s12.4.3.2 resynchronisation. Anyone can
 * read the checkpoint an external commit is built from, so it is accepted only
 * from an account already on the roster, and only as a swap of that account's
 * own leaf; it admits nobody.
 *
 * Throws if the commit's signature does not verify against the group's current
 * context, if members could not apply it to the public tree, if a leaf would
 * change address, or if the GroupInfo it publishes does not describe the epoch
 * it creates. Returns the new tree in wire form and the next epoch's transcript.
 */
export async function replayCommit(
  storedTree: string,
  transcript: GroupTranscript | null,
  tx: ReplayInput,
  group: ReplayGroup,
): Promise<ReplayResult> {
  const cs = await ciphersuiteFor(group.cipherSuite)
  const message = mls.decodeMlsMessage(Buffer.from(tx.commit, 'base64'), 0)?.[0]
  if (!message || message.wireformat !== 'mls_public_message') throw new Error('commit is not an MLS public message.')
  const content = message.publicMessage.content
  if (content.contentType !== 'commit') throw new Error('commit message does not carry a commit.')
  const external = content.sender.senderType === 'new_member_commit'
  if (!external && content.sender.senderType !== 'member') throw new Error(`commit sender type ${content.sender.senderType} is not allowed.`)
  const path = content.commit.path
  const nextTag = message.publicMessage.auth.confirmationTag
  if (!(nextTag instanceof Uint8Array)) throw new Error('the commit carries no confirmation tag.')

  const tree = storedTree.length > 0 ? treeFromWire(storedTree) : foundingTree(tx.ratchetTree, group)
  const { context: groupContext, confirmationTag, pskCount } = await currentEpoch(transcript, tree, tx, group, cs)

  /*
   * The signature, checked first, as members check it first.
   *
   * It covers the commit and the GroupContext of the epoch it was built on. A
   * member's commit is signed with the key in their own leaf -- the stored tree
   * is the computed one, so that is the key the group really holds. An external
   * commit is signed with the key in the leaf it brings. This refuses commits
   * forged for another member's leaf, built on a context the group never had,
   * or altered after signing. It cannot tell whether the encrypted path secrets
   * inside are good; that needs the group's secrets.
   */
  let signKey: Uint8Array
  if (external) {
    if (!group.members.includes(tx.from)) throw new Error('only a member of the group can rejoin it by external commit.')
    if (!path) throw new Error('an external commit must carry an UpdatePath.')
    signKey = path.leafNode.signaturePublicKey
  } else {
    const senderNode = tree[content.sender.leafIndex * 2]
    if (!senderNode || senderNode.nodeType !== 'leaf') throw new Error("the commit's sender leaf is blank.")
    signKey = senderNode.leaf.signaturePublicKey
  }
  const signatureValid = await mls.verifyFramedContentSignature(
    signKey,
    'mls_public_message',
    content,
    message.publicMessage.auth,
    groupContext,
    cs.signature,
  )
  if (!signatureValid) throw new Error("the commit's signature does not verify.")

  const { newTree, committerLeaf, carriesPsk } = external
    ? await replayExternal(tree, content.commit, tx, groupContext, cs)
    : await replayMember(tree, content.commit, content.sender.leafIndex, tx, groupContext, cs)

  checkNodeSizes(newTree)

  // The next epoch's context, exactly as members derive it in processCommit.
  const newTreeHash = await mls.treeHashRoot(newTree, cs.hash)
  const next = await mls.nextEpochContext(
    groupContext,
    'mls_public_message',
    content,
    message.publicMessage.auth.signature,
    newTreeHash,
    confirmationTag,
    cs.hash,
  )
  await verifyCheckpoint(tx.groupInfo, next, nextTag, committerLeaf, newTree, cs)

  return {
    tree: treeToWire(newTree),
    transcript: {
      epoch: group.epoch + 1,
      treeHash: b64(newTreeHash),
      confirmedTranscriptHash: b64(next.confirmedTranscriptHash),
      confirmationTag: b64(nextTag),
      pskCount: pskCount + (carriesPsk ? 1 : 0),
    },
    external,
  }
}

interface Replayed {
  newTree: any[]
  committerLeaf: number
  carriesPsk: boolean
}

/** A member's own commit: their proposals, then their UpdatePath. */
async function replayMember(tree: any[], commit: any, senderLeaf: number, tx: ReplayInput, groupContext: any, cs: any): Promise<Replayed> {
  const grouped = groupProposals(commit.proposals, senderLeaf)
  const proposalError = await mls.validateProposals(
    grouped,
    senderLeaf,
    groupContext,
    mls.defaultKeyPackageEqualityConfig,
    mls.defaultAuthenticationService,
    tree,
  )
  if (proposalError) fail(proposalError)
  if (grouped.external_init.length > 0) throw new Error("a member's commit cannot carry an external_init proposal.")

  const [mutated] = await mls.applyTreeMutations(
    tree,
    grouped,
    groupContext,
    false,
    mls.defaultAuthenticationService,
    mls.defaultLifetimeConfig,
    cs.signature,
  )

  // RFC 9420 s12.4, as patched in the bundle: a commit with no proposals, or
  // with any Update or Remove, must carry an UpdatePath.
  const path = commit.path
  const needsPath = commit.proposals.length === 0 || grouped.update.length > 0 || grouped.remove.length > 0
  if (needsPath && !path) throw new Error('commit must carry an UpdatePath.')
  const newTree = path ? await applyPath(mutated, path, senderLeaf, tx, groupContext, cs, false) : mutated
  return { newTree, committerLeaf: senderLeaf, carriesPsk: grouped.psk.length > 0 }
}

/**
 * A member rejoining: their former leaf out, their new leaf and path in.
 *
 * Mirrors ts-mls applyProposals' external branch and applyTreeUpdate. The only
 * proposals allowed are the external_init itself and the removal of the
 * rejoiner's own former leaf -- and that removal is required whenever they
 * still have a leaf, or the tree would hold two leaves for one account.
 */
async function replayExternal(tree: any[], commit: any, tx: ReplayInput, groupContext: any, cs: any): Promise<Replayed> {
  const grouped = groupProposals(commit.proposals, undefined)
  const others = commit.proposals.filter((e: any) => !['external_init', 'remove'].includes(e.proposal.proposalType))
  if (grouped.external_init.length !== 1 || grouped.remove.length > 1 || others.length > 0) {
    throw new Error('an external commit must carry one external_init and at most the removal of its own former leaf.')
  }
  const formerLeaf = tree.findIndex((n: any, i: number) => i % 2 === 0 && n && n.nodeType === 'leaf' && leafAddress(n.leaf) === tx.from)
  const removed = grouped.remove[0]?.proposal.remove.removed
  if (formerLeaf >= 0 && removed !== formerLeaf / 2) throw new Error('an external commit must remove the sender\'s former leaf.')
  if (formerLeaf < 0 && removed !== undefined) throw new Error('an external commit may only remove the sender\'s own former leaf.')

  const treeAfterRemove = removed === undefined ? tree : mls.removeLeafNode(tree, removed)
  const [treeWithLeaf, leafNodeIndex] = mls.addLeafNode(treeAfterRemove, commit.path.leafNode)
  const newLeaf = leafNodeIndex / 2
  const newTree = await applyPath(treeWithLeaf, commit.path, newLeaf, tx, groupContext, cs, true, treeAfterRemove)
  return { newTree, committerLeaf: newLeaf, carriesPsk: false }
}

/** The committer's UpdatePath, validated and applied. */
async function applyPath(
  tree: any[],
  path: any,
  leafIndex: number,
  tx: ReplayInput,
  groupContext: any,
  cs: any,
  external: boolean,
  treeForUniqueness: any[] = tree,
): Promise<any[]> {
  /*
   * The committer's new leaf must keep their address. Its credential is
   * self-signed and the default authentication service accepts any credential,
   * so without this a member could re-key their leaf under someone else's
   * address and every client would accept it.
   */
  if (leafAddress(path.leafNode) !== tx.from) throw new Error("the commit's new leaf does not carry the sender's address.")
  const leafError = await mls.validateLeafNodeUpdateOrCommit(
    path.leafNode,
    leafIndex,
    groupContext,
    mls.defaultAuthenticationService,
    cs.signature,
  )
  if (leafError) fail(leafError)
  const uniquenessError = await mls.validateLeafNodeCredentialAndKeyUniqueness(treeForUniqueness, path.leafNode, leafIndex)
  if (uniquenessError) fail(uniquenessError)
  return mls.applyUpdatePath(tree, leafIndex, path, cs.hash, external)
}

/**
 * The GroupInfo a commit publishes must describe the epoch it creates (T18).
 *
 * It is the checkpoint a member who falls out of step rejoins from, so a wrong
 * one strands them. Everything in it but the external_pub key can be checked
 * against what the network just computed: the GroupContext, the confirmation
 * tag, and a signature from the committer's leaf in the new tree. external_pub
 * is derived from the group's secrets; a bad one makes the next rejoin fail to
 * apply for others, and the rejoiner's own commit then publishes a good one.
 */
async function verifyCheckpoint(groupInfoB64: string, next: any, confirmationTag: Uint8Array, signer: number, tree: any[], cs: any): Promise<void> {
  if (typeof groupInfoB64 !== 'string' || groupInfoB64.length === 0) throw new Error('commit must publish the GroupInfo for its new epoch.')
  let message: any
  try {
    message = mls.decodeMlsMessage(Buffer.from(groupInfoB64, 'base64'), 0)?.[0]
  } catch {
    message = undefined
  }
  if (!message || message.wireformat !== 'mls_group_info') throw new Error('the published GroupInfo is not decodable.')
  const gi = message.groupInfo
  const gc = gi.groupContext
  const matches =
    gc.version === next.version &&
    gc.cipherSuite === next.cipherSuite &&
    gc.epoch === next.epoch &&
    sameBytes(gc.groupId, next.groupId) &&
    sameBytes(gc.treeHash, next.treeHash) &&
    sameBytes(gc.confirmedTranscriptHash, next.confirmedTranscriptHash) &&
    gc.extensions.length === 0
  if (!matches) throw new Error('the published GroupInfo does not describe the epoch this commit creates.')
  if (!sameBytes(gi.confirmationTag, confirmationTag)) throw new Error("the published GroupInfo carries another epoch's confirmation tag.")
  if (gi.signer !== signer) throw new Error('the published GroupInfo is not signed by the committer.')
  const externalPub = gi.extensions.filter((e: any) => e.extensionType === 'external_pub')
  if (externalPub.length !== 1 || gi.extensions.length !== 1 || externalPub[0].extensionData.length === 0) {
    throw new Error('the published GroupInfo must carry exactly an external_pub extension.')
  }
  const signerNode = tree[signer * 2]
  if (!signerNode || signerNode.nodeType !== 'leaf') throw new Error('the published GroupInfo names a blank signer.')
  if (!(await mls.verifyGroupInfoSignature(gi, signerNode.leaf.signaturePublicKey, cs.signature))) {
    throw new Error("the published GroupInfo's signature does not verify.")
  }
}

/** Two stored trees are the same tree: same nodes, trailing blanks ignored. */
export const sameTree = (a: string, b: string): boolean => {
  const trim = (wire: string): (string | null)[] => {
    const nodes = wire.length > 0 ? JSON.parse(wire) : []
    while (nodes.length > 0 && nodes[nodes.length - 1] === null) nodes.pop()
    return nodes
  }
  try {
    return JSON.stringify(trim(a)) === JSON.stringify(trim(b))
  } catch {
    return false
  }
}
