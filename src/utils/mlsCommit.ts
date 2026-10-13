/**
 * What a group_commit actually does, read from the commit itself.
 *
 * Commits travel as MLS PublicMessages: the proposals are readable by anyone,
 * while the UpdatePath stays encrypted to the group. That lets the network check
 * the commit against the sender's declaration instead of trusting it. Without
 * this, a member could declare "no membership change" and commit Add or Remove
 * proposals anyway -- the server would accept it from a non-admin, and every
 * client would apply it, so the roster on chain would stop matching who can read
 * the group (threat model T1).
 *
 * The parser is the same ts-mls bundle the client ships (src/vendor/ts-mls.js,
 * byte-identical to web-client-v2 external/ts-mls.js). A home-grown decoder
 * would be a second reading of the same bytes, and any place the two readings
 * differ is a place to hide a proposal.
 *
 * Decoding is pure and deterministic, so every validator reaches the same
 * verdict. Nothing here touches keys or does cryptography.
 *
 * Limits, so nobody mistakes this for more than it is:
 *  - The commit's signature and membership tag are not verified. The network
 *    lacks the group's transcript hashes and membership key. That does not
 *    weaken the T1 check -- the proposals checked here are the exact bytes every
 *    client will apply -- but a well-formed commit whose encrypted path is
 *    garbage still decodes fine and still stalls the group (T2, partly open).
 *  - Leaf identities come from the stored ratchet tree, which is assembled from
 *    client-supplied tree deltas. The check is only as good as that tree.
 */
import * as mls from '../vendor/ts-mls.js'

/** The proposal types each kind of commit may carry. Anything else is refused. */
const MEMBER_PROPOSALS = new Set(['add', 'remove', 'psk'])
const EXTERNAL_PROPOSALS = new Set(['external_init', 'remove'])

export interface CommitDeclaration {
  from: string
  commit: string
  epoch: number
  addedMembers: string[]
  removedMembers: string[]
  consumedKeyPackages: { address: string; keyPackage: string }[]
  pskId?: string // b64; members step their PSK ratchet when this is set
  pskNonce?: string // b64
}

export interface GroupFacts {
  mlsGroupId: string
  epoch: number
  admins: string[]
  createdBy: string
  members: string[]
}

export interface CommitEffect {
  /** The sender's leaf; -1 for an external commit, whose sender has no leaf yet. */
  senderLeaf: number
  added: string[]
  removed: string[]
  /** A member rejoining by external commit (RFC 9420 s12.4.3.2). */
  external: boolean
}

export type CommitInspection = { ok: true; effect: CommitEffect } | { ok: false; reason: string }

const textDecoder = new TextDecoder()

const fromBase64 = (value: string): Uint8Array => new Uint8Array(Buffer.from(value, 'base64'))

const sameBytes = (a: Uint8Array, b: Uint8Array): boolean =>
  a instanceof Uint8Array && b instanceof Uint8Array && a.length === b.length && a.every((v, i) => v === b[i])

const decodeMessage = (bytes: Uint8Array): any => {
  // decodeMlsMessage returns undefined for some malformed input and throws for
  // the rest; both mean the same thing here.
  const decoded = (mls as any).decodeMlsMessage(bytes, 0)
  return decoded ? decoded[0] : undefined
}

/**
 * A KeyPackage in canonical wire form, so the copy inside an Add proposal and
 * the copy the addee published compare as bytes. Re-encoding a decoded value is
 * canonical in the TLS presentation language: one value, one encoding.
 */
const canonicalKeyPackage = (keyPackage: unknown): string =>
  Buffer.from((mls as any).encodeMlsMessage({ wireformat: 'mls_key_package', version: 'mls10', keyPackage })).toString('base64')

/**
 * The address in the leaf at `leafIndex` of the stored tree, or null if blank.
 *
 * The tree is a JSON array of per-node base64 blobs; leaves sit at even node
 * indices. Before the group's first commit nothing has been stored yet, and the
 * founder is the only member, at leaf 0.
 */
const leafAddress = (storedTree: string, leafIndex: number, group: GroupFacts): string | null => {
  let nodes: (string | null)[] = []
  if (storedTree.length > 0) {
    const parsed = JSON.parse(storedTree)
    if (!Array.isArray(parsed)) throw new Error('stored ratchet tree is not an array')
    nodes = parsed
  }
  if (nodes.length === 0) return group.epoch === 0 && leafIndex === 0 ? group.createdBy : null

  const blob = nodes[leafIndex * 2]
  if (typeof blob !== 'string') return null
  const decoded = (mls as any).decodeNode(fromBase64(blob), 0)
  const node = decoded ? decoded[0] : undefined
  if (!node || node.nodeType !== 'leaf') return null
  return textDecoder.decode(node.leaf.credential.identity)
}

const sameMembers = (a: string[], b: string[]): boolean => {
  if (a.length !== b.length) return false
  const sortedA = [...a].sort()
  const sortedB = [...b].sort()
  return sortedA.every((value, i) => value === sortedB[i])
}

/**
 * Reads `tx.commit` and checks it against the declaration and the group.
 *
 * Refuses a commit that is not a PublicMessage commit for this group and epoch;
 * one whose sender leaf is not tx.from; one carrying a proposal by reference or
 * of a type other than add, remove and psk; and one whose real adds or removes
 * differ from tx.addedMembers / tx.removedMembers. The admin rule is then
 * applied to the REAL change, not the declared one.
 */
export function inspectCommit(tx: CommitDeclaration, group: GroupFacts, storedTree: string): CommitInspection {
  const refuse = (reason: string): CommitInspection => ({ ok: false, reason })

  let message: any
  try {
    message = decodeMessage(fromBase64(tx.commit))
  } catch (e) {
    return refuse('commit is not a decodable MLS message.')
  }
  if (!message) return refuse('commit is not a decodable MLS message.')
  if (message.wireformat !== 'mls_public_message') {
    return refuse(`commit must be an MLS public message, not ${message.wireformat}.`)
  }

  const content = message.publicMessage.content
  if (content.contentType !== 'commit') return refuse(`commit message carries ${content.contentType}, not a commit.`)
  if (textDecoder.decode(content.groupId) !== group.mlsGroupId) return refuse('commit is for a different MLS group.')
  if (Number(content.epoch) !== tx.epoch || tx.epoch !== group.epoch) {
    return refuse(`commit is built on epoch ${content.epoch}; the group is at ${group.epoch}.`)
  }
  /*
   * An external commit is how a member whose device fell out of step rejoins:
   * from the checkpoint GroupInfo, which anyone can read. So it is accepted only
   * from an account already on the roster, and it may change nothing but that
   * account's own leaf -- it adds and removes nobody.
   */
  const external = content.sender.senderType === 'new_member_commit'
  if (!external && content.sender.senderType !== 'member') {
    return refuse(`commit sender type ${content.sender.senderType} is not allowed.`)
  }
  if (external) {
    if (!group.members.includes(tx.from)) return refuse('only a member can rejoin a group by external commit.')
    if (tx.addedMembers.length > 0 || tx.removedMembers.length > 0 || tx.consumedKeyPackages.length > 0) {
      return refuse('an external commit cannot add or remove members.')
    }
    if (!content.commit.path) return refuse('an external commit must carry an UpdatePath.')
  } else {
    let senderAddress: string | null
    try {
      senderAddress = leafAddress(storedTree, content.sender.leafIndex, group)
    } catch (e) {
      return refuse('stored ratchet tree could not be read.')
    }
    if (senderAddress !== tx.from) return refuse('commit is signed from a leaf that is not the sender.')
  }
  // The committer's new leaf is self-signed and any credential is accepted by
  // the default authentication service, so the address must be held fixed here.
  const pathLeaf = content.commit.path?.leafNode
  if (pathLeaf && textDecoder.decode(pathLeaf.credential.identity) !== tx.from) {
    return refuse("commit's new leaf does not carry the sender's address.")
  }

  const declaredByKeyPackage = new Map<string, string>()
  for (const consumed of tx.consumedKeyPackages) {
    let published: any
    try {
      published = decodeMessage(fromBase64(consumed.keyPackage))
    } catch (e) {
      return refuse(`declared key package for ${consumed.address} is not decodable.`)
    }
    if (!published || published.wireformat !== 'mls_key_package') {
      return refuse(`declared key package for ${consumed.address} is not a key package.`)
    }
    declaredByKeyPackage.set(canonicalKeyPackage(published.keyPackage), consumed.address)
  }

  const added: string[] = []
  const removed: string[] = []
  const psks: any[] = []
  const allowed = external ? EXTERNAL_PROPOSALS : MEMBER_PROPOSALS
  for (const entry of content.commit.proposals) {
    // A reference points at a proposal sent earlier in its own message, which
    // the network never sees. Only proposals carried in the commit can be checked.
    if (entry.proposalOrRefType !== 'proposal') return refuse('commit carries a proposal by reference.')
    const proposal = entry.proposal
    if (!allowed.has(proposal.proposalType)) {
      return refuse(`commit carries a ${proposal.proposalType} proposal, which is not allowed.`)
    }
    if (proposal.proposalType === 'psk') psks.push(proposal.psk.preSharedKeyId)
    if (proposal.proposalType === 'add') {
      const address = declaredByKeyPackage.get(canonicalKeyPackage(proposal.add.keyPackage))
      if (!address) return refuse('commit adds a key package that was not declared.')
      // Publishing does not parse key packages, so an account can publish one
      // naming someone else. Members' rosters show the name inside it.
      if (textDecoder.decode(proposal.add.keyPackage.leafNode.credential.identity) !== address) {
        return refuse(`the key package added for ${address} names someone else.`)
      }
      added.push(address)
    } else if (proposal.proposalType === 'remove') {
      let address: string | null
      try {
        address = leafAddress(storedTree, proposal.remove.removed, group)
      } catch (e) {
        return refuse('stored ratchet tree could not be read.')
      }
      if (!address) return refuse(`commit removes leaf ${proposal.remove.removed}, which is blank.`)
      if (external) {
        // The rejoiner's former leaf, swapped for the new one; not a removal.
        if (address !== tx.from) return refuse("an external commit may only remove the sender's own former leaf.")
      } else {
        removed.push(address)
      }
    }
  }

  /*
   * Members step their PSK ratchet when the record carries a pskId, not by
   * reading the commit. If the two disagreed, every member would derive the
   * wrong PSK and be unable to apply the commit, so they must agree exactly.
   */
  const declaredPskId = tx.pskId ?? ''
  if (declaredPskId.length === 0) {
    if (psks.length > 0) return refuse('commit carries a PSK proposal but declares no pskId.')
  } else {
    const psk = psks[0]
    if (
      psks.length !== 1 ||
      psk.psktype !== 'external' ||
      !sameBytes(psk.pskId, fromBase64(declaredPskId)) ||
      !sameBytes(psk.pskNonce, fromBase64(tx.pskNonce ?? ''))
    ) {
      return refuse('commit\'s PSK proposal does not match the declared pskId and pskNonce.')
    }
  }

  if (!sameMembers(added, tx.addedMembers)) {
    return refuse(`commit adds [${added.join(', ')}] but declares [${tx.addedMembers.join(', ')}].`)
  }
  if (!sameMembers(removed, tx.removedMembers)) {
    return refuse(`commit removes [${removed.join(', ')}] but declares [${tx.removedMembers.join(', ')}].`)
  }
  if ((added.length > 0 || removed.length > 0) && !group.admins.includes(tx.from)) {
    return refuse('only an admin may add or remove members.')
  }

  return { ok: true, effect: { senderLeaf: external ? -1 : content.sender.leafIndex, added, removed, external } }
}
