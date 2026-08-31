import * as crypto from '../crypto'
import { Shardus, ShardusTypes } from '@shardus/core'
import * as utils from '../utils'
import * as config from '../config'
import { UserAccount, GroupAccount, GroupTreeAccount, ChatAccount, WrappedStates, Tx, AppReceiptData, TXTypes } from '../@types'
import { SafeBigIntMath } from '../utils/safeBigIntMath'
import * as AccountsStorage from '../storage/accountStorage'
import { isUserAccount, isGroupAccount, isGroupTreeAccount } from '../@types/accountTypeGuards'
import create from '../accounts'

/**
 * An MLS membership change: proposals + commit, plus the Welcomes for anyone
 * being added.
 *
 * THE EPOCH FENCE
 * ---------------
 * MLS cannot tolerate two members committing at the same epoch — that is an
 * unrecoverable state fork. Because every group transaction targets one
 * account, Shardus orders them deterministically by timestamp, so requiring
 * `tx.epoch === group.epoch` makes the network itself enforce
 * exactly-one-commit-per-epoch: the first commit bumps the epoch and any racer
 * still naming the old one is rejected with 'stale epoch'. The loser applies
 * the winning commit, rebuilds its proposal and retries.
 *
 * This is stronger than what a conventional delivery service can offer, and it
 * is the reason MLS fits a blockchain well.
 */
export const validate_fields = (tx: Tx.GroupCommit, response: ShardusTypes.IncomingTransactionResult): ShardusTypes.IncomingTransactionResult => {
  if (utils.isValidAddress(tx.from) === false) {
    response.reason = 'tx "from" is not a valid address.'
    return response
  }
  if (utils.isValidAddress(tx.groupId) === false) {
    response.reason = 'tx "groupId" is not a valid address.'
    return response
  }
  if (typeof tx.epoch !== 'number' || !Number.isInteger(tx.epoch) || tx.epoch < 0) {
    response.reason = 'tx "epoch" must be a non-negative integer.'
    return response
  }
  if (typeof tx.commit !== 'string' || tx.commit.length === 0) {
    response.reason = 'tx "commit" must be a non-empty string.'
    return response
  }
  if (!Array.isArray(tx.proposals)) {
    response.reason = 'tx "proposals" must be an array.'
    return response
  }
  if (typeof tx.pskId !== 'string' || typeof tx.pskNonce !== 'string') {
    response.reason = 'tx "pskId" and "pskNonce" must be strings.'
    return response
  }
  if (typeof tx.groupInfo !== 'string' || typeof tx.ratchetTree !== 'string') {
    response.reason = 'tx "groupInfo" and "ratchetTree" must be strings.'
    return response
  }
  /*
   * The ratchet tree is published as a DELTA: only the nodes this commit
   * changed, addressed by ratchet-tree node index. The full tree is ~1.8 kB per
   * member, whereas a delta is one node on an add and O(log N) on a rekey, so
   * this is what keeps a commit's size independent of group size.
   *
   * `ratchetTree` is now a BASELINE, sent only on a group's first commit or on
   * migration; every other commit leaves it empty and sends a delta instead.
   */
  if (!Array.isArray(tx.treeDelta)) {
    response.reason = 'tx "treeDelta" must be an array.'
    return response
  }
  /*
   * The index has to be bounded, not merely non-negative.
   *
   * applyTreeDelta grows the node array until it reaches entry.i, and the size
   * check further down measures only the NODE PAYLOAD -- String(d.n) + 16 --
   * so it never sees the index at all. `{i: 50000000, n: "AA"}` scores about
   * 18 bytes, clears any groupMessageSizeLimit, and then costs fifty million
   * array slots that get serialised into the account.
   *
   * This belongs in validate_fields rather than validate(): handleSharedTX
   * calls app.validate and nothing else, so this is the only check a
   * transaction arriving by gossip has to pass. A bound placed here holds even
   * against a node that skips its own precrack and spreads the transaction
   * directly to the group.
   *
   * A tree of N leaves uses node indices up to 2N-2, so 2 * groupMaxMembers is
   * the ceiling for any group the network will admit.
   */
  const maxNodeIndex = 2 * config.LiberdusFlags.groupMaxMembers
  for (const entry of tx.treeDelta) {
    if (!entry || typeof entry.i !== 'number' || !Number.isInteger(entry.i) || entry.i < 0) {
      response.reason = 'tx "treeDelta" contains an entry with an invalid node index.'
      return response
    }
    if (entry.i > maxNodeIndex) {
      response.reason = `tx "treeDelta" node index ${entry.i} exceeds the maximum ${maxNodeIndex} for a group of up to ${config.LiberdusFlags.groupMaxMembers} members.`
      return response
    }
    if (entry.n !== null && typeof entry.n !== 'string') {
      response.reason = 'tx "treeDelta" entries must carry a base64 node or null to blank it.'
      return response
    }
  }
  if (tx.ratchetTree.length === 0 && tx.treeDelta.length === 0) {
    response.reason = 'tx must carry either a baseline "ratchetTree" or a non-empty "treeDelta".'
    return response
  }
  if (!Array.isArray(tx.addedMembers) || !Array.isArray(tx.removedMembers)) {
    response.reason = 'tx "addedMembers" and "removedMembers" must be arrays.'
    return response
  }
  if (!Array.isArray(tx.welcomes)) {
    response.reason = 'tx "welcomes" must be an array.'
    return response
  }
  if (!Array.isArray(tx.consumedKeyPackages)) {
    response.reason = 'tx "consumedKeyPackages" must be an array.'
    return response
  }
  /*
   * Exactly one consumed KeyPackage per added member. The network cannot parse
   * MLS, so this declaration is the only thing that lets apply() pop the used
   * package from the addee's pool. Without it a committer could keep adding
   * someone against the same init key, defeating forward secrecy.
   */
  if (tx.consumedKeyPackages.length !== tx.addedMembers.length) {
    response.reason = 'tx must declare exactly one consumed key package per added member.'
    return response
  }
  const consumedFor = new Set(tx.consumedKeyPackages.map((c) => c && c.address))
  if (consumedFor.size !== tx.addedMembers.length || !tx.addedMembers.every((a) => consumedFor.has(a))) {
    response.reason = 'tx "consumedKeyPackages" must cover each added member exactly once.'
    return response
  }

  const maxPerCommit = config.LiberdusFlags.groupMaxMembersPerCommit
  if (tx.addedMembers.length + tx.removedMembers.length > maxPerCommit) {
    response.reason = `a commit may change at most ${maxPerCommit} members.`
    return response
  }
  for (const address of [...tx.addedMembers, ...tx.removedMembers]) {
    if (utils.isValidAddress(address) === false) {
      response.reason = 'tx contains an invalid member address.'
      return response
    }
  }
  if (new Set(tx.addedMembers).size !== tx.addedMembers.length) {
    response.reason = 'tx "addedMembers" contains duplicates.'
    return response
  }
  if (new Set(tx.removedMembers).size !== tx.removedMembers.length) {
    response.reason = 'tx "removedMembers" contains duplicates.'
    return response
  }
  // Every added member needs a Welcome, or they can never join.
  if (tx.welcomes.length !== tx.addedMembers.length) {
    response.reason = 'tx must contain exactly one welcome per added member.'
    return response
  }
  for (const welcome of tx.welcomes) {
    if (!welcome || !tx.addedMembers.includes(welcome.address)) {
      response.reason = 'tx contains a welcome for an address that is not being added.'
      return response
    }
    const env = welcome.envelope
    if (!env || typeof env.welcome !== 'string' || typeof env.ratchetTree !== 'string' || !env.sealedPsk) {
      response.reason = 'tx contains a malformed welcome envelope.'
      return response
    }
    if (
      typeof env.sealedPsk.cipherText !== 'string' ||
      typeof env.sealedPsk.nonce !== 'string' ||
      typeof env.sealedPsk.ct !== 'string'
    ) {
      response.reason = 'tx contains a malformed sealed post-quantum PSK.'
      return response
    }
  }

  /*
   * The welcomes are counted here, not just the commit.
   *
   * Each welcome envelope carries a full ratchet tree (~1.8 kB per group member)
   * plus a sealed post-quantum PSK, so on an add they are by far the largest
   * part of the transaction — the commit itself is a few kB and does not grow
   * with the group. Measuring only commit + groupInfo + ratchetTree let a
   * multi-hundred-kB transaction pass a 64 kB limit, which made the check worse
   * than useless: it reported a number nobody could act on while the real
   * payload went unbounded.
   */
  const welcomeBytes = tx.welcomes.reduce((sum, w) => {
    const env = w.envelope
    // sealedPsk is an object ({cipherText, nonce}), so sum its fields rather
    // than stringifying it — String(obj) would score every PSK as 15 bytes.
    return (
      sum +
      Buffer.byteLength(String(env.welcome), 'utf8') +
      Buffer.byteLength(String(env.ratchetTree || ''), 'utf8') +
      Buffer.byteLength(String(env.sealedPsk.cipherText || ''), 'utf8') +
      Buffer.byteLength(String(env.sealedPsk.nonce || ''), 'utf8')
    )
  }, 0)

  const totalBytes =
    Buffer.byteLength(tx.commit, 'utf8') +
    Buffer.byteLength(tx.groupInfo, 'utf8') +
    Buffer.byteLength(tx.ratchetTree, 'utf8') +
    tx.proposals.reduce((sum, p) => sum + Buffer.byteLength(String(p), 'utf8'), 0) +
    tx.treeDelta.reduce((sum, d) => sum + Buffer.byteLength(String(d.n || ''), 'utf8') + 16, 0) +
    welcomeBytes
  if (totalBytes / 1024 > config.LiberdusFlags.groupMessageSizeLimit) {
    response.reason =
      `commit payload exceeds ${config.LiberdusFlags.groupMessageSizeLimit} kB ` +
      `(${Math.ceil(totalBytes / 1024)} kB, of which ${Math.ceil(welcomeBytes / 1024)} kB is welcomes).`
    return response
  }

  if (typeof tx.fee !== 'bigint') {
    response.reason = 'tx "fee" must be a bigint.'
    return response
  }
  if (!tx.sign || !tx.sign.owner || !tx.sign.sig || tx.sign.owner !== tx.from) {
    response.reason = 'not signed by from account'
    return response
  }
  if (crypto.verifyObj(tx) === false) {
    response.reason = 'incorrect signing'
    return response
  }
  response.success = true
  return response
}

/**
 * Does this commit repair the tree, rather than change it?
 *
 * A removal blanks every ancestor of the departing leaf, and the group stays
 * degraded until some member commits a path update that fills them back in.
 * That is the work the maintenance balance exists to pay for, and this is how
 * the network recognises it -- from state it already holds, with nothing
 * asserted by the sender.
 *
 * The tree is stored as a JSON array of node-or-null (see applyTreeDelta), so
 * "was that node blank" is an array lookup. No MLS parsing is involved, and no
 * leaf is attributed to anyone: the question is whether the tree was damaged
 * and this commit repairs it, NOT whether the sender is the member who ought to
 * have done it. The server stores members[] but not leaf indices, so it could
 * not answer the second question anyway.
 *
 * Two judgement calls worth knowing about:
 *
 *  - An index at or past the end of the array counts as blank. Trailing blanks
 *    are trimmed on write, so a removal on the right-hand side of the tree
 *    leaves its ancestors -- up to and including the root -- simply absent.
 *    Refusing to count those would deny the subsidy to exactly the repairs it
 *    is meant to fund.
 *  - A delta entry that blanks a node (n === null) never counts. Blanking is
 *    damage, not repair.
 *
 * MUST be evaluated before applyTreeDelta runs, while the stored tree is still
 * the pre-commit one.
 */
const fillsABlankNode = (storedTree: string, delta: { i: number; n: string | null }[]): boolean => {
  let nodes: (string | null)[] = []
  if (storedTree.length > 0) {
    try {
      const parsed = JSON.parse(storedTree)
      if (Array.isArray(parsed)) nodes = parsed
    } catch {
      // An unreadable tree is not something to hand out a subsidy for.
      return false
    }
  }
  for (const entry of delta) {
    if (entry.n === null) continue
    if (entry.i >= nodes.length || nodes[entry.i] === null) return true
  }
  return false
}

/**
 * A commit that changes no membership -- the shape a path update takes.
 *
 * Absent arrays are read as empty. validate_fields has already rejected any
 * that are present but not arrays, so the only way to get here with one missing
 * is a caller that skipped it, and "nobody was added" is the right reading.
 */
const isMembershipNeutral = (tx: Tx.GroupCommit): boolean =>
  (tx.addedMembers?.length ?? 0) === 0 &&
  (tx.removedMembers?.length ?? 0) === 0 &&
  (tx.welcomes?.length ?? 0) === 0

/**
 * What this commit owes the group's maintenance balance: one repair deposit per
 * added member, priced at the fee current right now.
 *
 * Charged to the admin doing the adding, so the cost of a member's eventual
 * departure is paid by whoever chose to admit them, at the moment they choose
 * it. Nothing is owed by a commit that adds nobody -- a plain rekey or a
 * removal takes money OUT of the balance, it does not put more in.
 *
 * Shared by validate, validatePreCrack and apply so the three cannot disagree
 * about the amount; a mismatch would let a commit pass validation and then
 * underflow the admin's balance in apply.
 */
const repairDepositOwed = (tx: Tx.GroupCommit, transactionFee: bigint): bigint => {
  const added = tx.addedMembers?.length ?? 0
  if (added === 0) return BigInt(0)
  const perMember = SafeBigIntMath.multiply(transactionFee, BigInt(config.LiberdusFlags.groupRepairDepositMultiplier))
  return SafeBigIntMath.multiply(perMember, BigInt(added))
}

/**
 * The subset of validate() that needs only the GroupAccount and the sender.
 *
 * Called from txPreCrackData, before the transaction enters the queue, where a
 * rejection costs nothing. validate() itself cannot be reused there: it
 * dereferences the GroupTreeAccount, and fetching a ~112 kB ratchet tree on
 * every commit injection would cost more than the fee this saves.
 *
 * Every check here is copied from validate(), same order and same wording, so
 * a transaction that clears this one fails later only for a reason that genuinely
 * needs the tree -- or because the epoch moved underneath it between here and
 * consensus, which is the race this cannot eliminate.
 *
 * Deliberately NOT a security boundary. It runs only on the node a client
 * injects to; a transaction spread by gossip reaches handleSharedTX, which
 * calls app.validate and never precracks. validate() inside apply() remains the
 * check that actually decides anything.
 */
export const validatePreCrack = (
  tx: Tx.GroupCommit,
  wrappedStates: WrappedStates,
  response: ShardusTypes.IncomingTransactionResult,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  dapp: Shardus,
): ShardusTypes.IncomingTransactionResult => {
  const from: UserAccount = wrappedStates[tx.from] && wrappedStates[tx.from].data
  const group: GroupAccount = wrappedStates[tx.groupId] && wrappedStates[tx.groupId].data

  if (typeof from === 'undefined' || from === null) {
    response.reason = '"from" account does not exist.'
    return response
  }
  if (!isUserAccount(from)) {
    response.reason = 'from account is not a UserAccount'
    return response
  }
  if (typeof group === 'undefined' || group === null) {
    response.reason = '"groupId" account does not exist.'
    return response
  }
  if (!isGroupAccount(group)) {
    response.reason = 'groupId account is not a GroupAccount'
    return response
  }
  if (!group.members.includes(tx.from)) {
    response.reason = 'sender is not a member of this group.'
    return response
  }

  // THE FENCE, screened early. This is the check the whole hook exists for:
  // without it, every member that loses an ordinary epoch race pays a full fee
  // to be told it lost.
  if (tx.epoch !== group.epoch) {
    response.reason = `stale epoch: commit targets epoch ${tx.epoch} but the group is at ${group.epoch}. Apply the latest commit and retry.`
    return response
  }

  const changesMembership = tx.addedMembers.length > 0 || tx.removedMembers.length > 0
  if (changesMembership && !group.admins.includes(tx.from)) {
    response.reason = 'only an admin may add or remove members.'
    return response
  }

  const transactionFee = utils.getTransactionFeeWei(AccountsStorage.cachedNetworkAccount)
  if (transactionFee > tx.fee) {
    response.reason = `The network transaction fee (${transactionFee}) is greater than the transaction fee provided (${tx.fee}).`
    return response
  }
  const depositOwed = repairDepositOwed(tx, transactionFee)

  /*
   * The same excusal validate() makes for a group-funded repair, approximated.
   *
   * Whether a commit really fills a blank cannot be answered here: that needs
   * the ratchet tree, and fetching it per injection is the cost this hook
   * exists to avoid. So this asks the two questions the GroupAccount can
   * answer -- is the commit membership-neutral, and is the balance able to pay
   * -- plus a cheap shape check that the delta writes at least one node.
   *
   * The approximation is deliberately loose in the safe direction. It can let
   * through a broke sender whose commit turns out not to be a repair, and
   * validate() then rejects it inside apply(); it will never reject a genuine
   * repair that validate() would have excused. A pre-queue hook wrongly
   * refusing honest work is the failure that would actually hurt.
   */
  const writesANode = (tx.treeDelta ?? []).some((entry) => entry && entry.n !== null)
  const groupMightPayTheFee =
    isMembershipNeutral(tx) && writesANode && (group.maintenanceBalance ?? BigInt(0)) >= transactionFee

  const senderOwes = groupMightPayTheFee ? depositOwed : SafeBigIntMath.add(transactionFee, depositOwed)
  if (from.data.balance < senderOwes) {
    response.reason = `from account does not have sufficient funds ${from.data.balance} to cover the transaction fee (${transactionFee}) and the repair deposit (${depositOwed}).`
    return response
  }

  response.success = true
  response.reason = 'This transaction is valid!'
  return response
}

export const validate = (
  tx: Tx.GroupCommit,
  wrappedStates: WrappedStates,
  response: ShardusTypes.IncomingTransactionResult,
  dapp: Shardus,
): ShardusTypes.IncomingTransactionResult => {
  const from: UserAccount = wrappedStates[tx.from] && wrappedStates[tx.from].data
  const group: GroupAccount = wrappedStates[tx.groupId] && wrappedStates[tx.groupId].data
  const treeForValidate: GroupTreeAccount =
    wrappedStates[utils.calculateGroupTreeId(tx.groupId)] && wrappedStates[utils.calculateGroupTreeId(tx.groupId)].data

  if (typeof from === 'undefined' || from === null) {
    response.reason = '"from" account does not exist.'
    return response
  }
  if (!isUserAccount(from)) {
    response.reason = 'from account is not a UserAccount'
    return response
  }
  if (typeof group === 'undefined' || group === null) {
    response.reason = '"groupId" account does not exist.'
    return response
  }
  if (!isGroupAccount(group)) {
    response.reason = 'groupId account is not a GroupAccount'
    return response
  }
  if (!group.members.includes(tx.from)) {
    response.reason = 'sender is not a member of this group.'
    return response
  }

  // THE FENCE. Everything else about MLS ordering depends on this check.
  if (tx.epoch !== group.epoch) {
    response.reason = `stale epoch: commit targets epoch ${tx.epoch} but the group is at ${group.epoch}. Apply the latest commit and retry.`
    return response
  }

  const changesMembership = tx.addedMembers.length > 0 || tx.removedMembers.length > 0
  if (changesMembership && !group.admins.includes(tx.from)) {
    response.reason = 'only an admin may add or remove members.'
    return response
  }

  for (const address of tx.addedMembers) {
    if (group.members.includes(address)) {
      response.reason = `address ${address} is already a member.`
      return response
    }
    const addee: UserAccount = wrappedStates[address] && wrappedStates[address].data
    if (!addee || !isUserAccount(addee)) {
      response.reason = `added member ${address} does not have a UserAccount.`
      return response
    }

    /*
     * CONSENT TO BE ADDED, route 1: they asked.
     *
     * A pending join request IS the consent, and it is per-group and explicit,
     * so it overrides whatever the addee's blanket add policy says.
     */
    const requested = !!(treeForValidate && treeForValidate.pendingJoinRequests[address])

    /*
     * CONSENT TO BE ADDED, route 2.
     *
     * Being added is not free for the addee: it consumes one of their single-use
     * KeyPackages, and under update-on-join it makes them inject a group_commit
     * of their own. So an add that nobody asked for spends someone else's money
     * and their key material. The addee's account is already loaded here — it is
     * read just above — so this check costs nothing.
     */
    if (!requested) {
      const policy = addee.data.groupAddPolicy ?? config.LiberdusFlags.groupDefaultAddPolicy
      if (policy === 'nobody') {
        response.reason = `${address} does not accept group invitations; they must request to join.`
        return response
      }
      if (policy === 'contacts') {
        /*
         * "Connected" is expressed through the toll, not a friends list.
         *
         * A new ChatAccount starts at required: [1, 1] — both sides charging —
         * so `required === 0` is a deliberate act by the ADDEE waiving the toll
         * for this specific account, which is exactly the relationship that used
         * to be a friend entry. `required === 2` is an explicit block.
         *
         * Read from the addee's own slot: toll.required[i] is what party i
         * demands of the other, so the adder's setting says nothing about
         * whether the addee wants to hear from them.
         */
        const chatId = utils.calculateChatId(address, tx.from)
        const chat: ChatAccount = wrappedStates[chatId] && wrappedStates[chatId].data
        const [addr1] = utils.sortAddresses(address, tx.from)
        const addeeIndex = addr1 === address ? 0 : 1
        const addeeRequires = chat && Array.isArray(chat.toll?.required) ? chat.toll.required[addeeIndex] : 1

        if (addeeRequires === 2) {
          response.reason = `${address} has blocked ${tx.from}.`
          return response
        }
        if (addeeRequires !== 0) {
          response.reason = `${address} only accepts group invitations from accounts they are connected to.`
          return response
        }
      }
    }

    /*
     * The declared KeyPackage must actually be in the addee's pool.
     *
     * apply() removes it by value, so a string that was never there burns
     * nothing and leaves the real package reusable — and single-use KeyPackages
     * are precisely what stop one init key being used for two adds. Without this
     * the declaration is unenforced and the forward-secrecy property it exists
     * to provide is not actually held.
     */
    const declared = tx.consumedKeyPackages.find((c) => c.address === address)
    if (!declared) {
      // validate_fields already requires one per added member, but validate must
      // not depend on that having run — a throw here would fail the whole
      // transaction opaquely instead of rejecting it with a reason.
      response.reason = `no key package declared for ${address}.`
      return response
    }
    const pool = Array.isArray(addee.data.mlsKeyPackages) ? addee.data.mlsKeyPackages : []
    const isLastResort =
      !!addee.data.mlsLastResortKeyPackage && declared.keyPackage === addee.data.mlsLastResortKeyPackage
    if (!pool.includes(declared.keyPackage) && !isLastResort) {
      response.reason = `the key package declared for ${address} is not in their published pool.`
      return response
    }
  }
  for (const address of tx.removedMembers) {
    if (!group.members.includes(address)) {
      response.reason = `address ${address} is not a member.`
      return response
    }
  }
  if (tx.removedMembers.includes(tx.from)) {
    response.reason = 'use group_leave to remove yourself.'
    return response
  }

  const nextSize = group.members.length + tx.addedMembers.length - tx.removedMembers.length
  if (nextSize > group.maxMembers || nextSize > config.LiberdusFlags.groupMaxMembers) {
    response.reason = `group would exceed its member limit (${group.maxMembers}).`
    return response
  }
  if (nextSize < 1) {
    response.reason = 'a group must retain at least one member.'
    return response
  }

  // A consumed KeyPackage must actually be one the addee published, otherwise a
  // committer could add a key of its own choosing on someone else's behalf.
  for (const consumed of tx.consumedKeyPackages) {
    if (!tx.addedMembers.includes(consumed.address)) {
      response.reason = 'consumedKeyPackages references an address that is not being added.'
      return response
    }
    const addee: UserAccount = wrappedStates[consumed.address] && wrappedStates[consumed.address].data
    const pool = addee.data.mlsKeyPackages || []
    const isLastResort = addee.data.mlsLastResortKeyPackage === consumed.keyPackage
    if (!pool.includes(consumed.keyPackage) && !isLastResort) {
      response.reason = `key package for ${consumed.address} was not published by that account.`
      return response
    }
    if (addee.data.mlsCipherSuite !== undefined && addee.data.mlsCipherSuite !== group.cipherSuite) {
      response.reason = `key package for ${consumed.address} uses a different ciphersuite than the group.`
      return response
    }
  }

  const transactionFee = utils.getTransactionFeeWei(AccountsStorage.cachedNetworkAccount)
  if (transactionFee > tx.fee) {
    response.success = false
    response.reason = `The network transaction fee (${transactionFee}) is greater than the transaction fee provided (${tx.fee}).`
    return response
  }
  const depositOwed = repairDepositOwed(tx, transactionFee)

  /*
   * A repair the group's balance will cover does not need the sender to hold
   * anything. Without this the member with an empty wallet -- exactly the
   * person this whole mechanism is meant to stop charging -- still could not
   * submit the repair.
   *
   * The condition matches apply() exactly, including the tree lookup, so a
   * commit excused here is the same commit the balance goes on to pay for.
   */
  const groupWillPayTheFee =
    isMembershipNeutral(tx) &&
    !!treeForValidate &&
    fillsABlankNode(treeForValidate.ratchetTree, tx.treeDelta) &&
    (group.maintenanceBalance ?? BigInt(0)) >= transactionFee

  const senderOwes = groupWillPayTheFee ? depositOwed : SafeBigIntMath.add(transactionFee, depositOwed)
  if (from.data.balance < senderOwes) {
    response.reason = `from account does not have sufficient funds ${from.data.balance} to cover the transaction fee (${transactionFee}) and the repair deposit (${depositOwed}).`
    return response
  }

  response.success = true
  response.reason = 'This transaction is valid!'
  return response
}

/**
 * How far behind the current epoch an uncollected welcome may fall before it is
 * dropped. Generous: the only cost of keeping one is storage, but discarding one
 * an invitee could still have used would silently strand them.
 */
const WELCOME_RETENTION_EPOCHS = 50

/**
 * Applies a ratchet-tree delta to the stored tree.
 *
 * The tree is stored as base64 of ts-mls `encodeRatchetTree`, which is a
 * length-prefixed list of optional nodes. Rather than re-implement that codec
 * here, the account holds a JSON array of per-node base64 blobs (`null` = blank)
 * that the client assembles and the server only indexes into. The server never
 * parses a node; it moves opaque strings by index.
 *
 * Deterministic, so every validator produces the same bytes — a requirement for
 * consensus.
 */
const applyTreeDelta = (stored: string, delta: { i: number; n: string | null }[]): string => {
  let nodes: (string | null)[] = []
  if (stored.length > 0) {
    try {
      const parsed = JSON.parse(stored)
      if (Array.isArray(parsed)) nodes = parsed
    } catch {
      // Unreadable stored tree: rebuild from the delta rather than throwing and
      // wedging the group. The joiner's tree-hash check is what actually
      // protects correctness here.
      nodes = []
    }
  }
  for (const entry of delta) {
    // Grow with explicit blanks so indices stay meaningful; a sparse JS array
    // would serialise as nulls anyway but with undefined holes in between.
    while (nodes.length <= entry.i) nodes.push(null)
    nodes[entry.i] = entry.n
  }
  // Trailing blanks carry no information and would grow the account forever as
  // members are removed from the right-hand side of the tree.
  while (nodes.length > 0 && nodes[nodes.length - 1] === null) nodes.pop()
  return JSON.stringify(nodes)
}

export const apply = (
  tx: Tx.GroupCommit,
  txTimestamp: number,
  txId: string,
  wrappedStates: WrappedStates,
  dapp: Shardus,
  applyResponse: ShardusTypes.ApplyResponse,
): void => {
  const from: UserAccount = wrappedStates[tx.from].data
  const group: GroupAccount = wrappedStates[tx.groupId].data
  const treeId = utils.calculateGroupTreeId(tx.groupId)
  const tree: GroupTreeAccount = wrappedStates[treeId] && wrappedStates[treeId].data

  if (!tree) {
    throw Error('getRelevantAccount must create the GroupTreeAccount before apply')
  }

  const transactionFee = utils.getTransactionFeeWei(AccountsStorage.cachedNetworkAccount)

  /*
   * Who pays the fee.
   *
   * A repair commit is the group's own upkeep, so the group's balance pays it
   * and the member who happened to perform it is left alone. Anything else --
   * and any repair the balance cannot cover -- is charged to the sender as
   * before.
   *
   * Evaluated here, ahead of applyTreeDelta, because fillsABlankNode has to see
   * the tree as it was before this commit.
   *
   * The fee is burned either way: it is subtracted from an account and reported
   * in the receipt, with no credit anywhere. This decides which account it
   * comes out of, and changes nothing about supply.
   *
   * Note what is NOT here: a failed commit never reaches apply(), and the
   * balance never pays for one. Anyone able to inject transactions can generate
   * failures at will -- precrack only screens the node a client injects to --
   * so paying for them would be an open drain.
   */
  const groupPaysTheFee =
    isMembershipNeutral(tx) &&
    fillsABlankNode(tree.ratchetTree, tx.treeDelta) &&
    (group.maintenanceBalance ?? BigInt(0)) >= transactionFee

  if (groupPaysTheFee) {
    group.maintenanceBalance = SafeBigIntMath.subtract(group.maintenanceBalance ?? BigInt(0), transactionFee)
  } else {
    from.data.balance = SafeBigIntMath.subtract(from.data.balance, transactionFee)
  }

  /*
   * Collect the repair deposit for anyone this commit admits.
   *
   * Unlike the fee, this is not burned: it moves from the admin into the
   * group, where it can only ever be spent paying the fee on a future repair
   * commit. validate() has already checked the admin can cover fee + deposit,
   * so this cannot underflow.
   *
   * `?? 0` because a group serialized before maintenanceBalance existed
   * deserializes without it.
   */
  const depositOwed = repairDepositOwed(tx, transactionFee)
  if (depositOwed > BigInt(0)) {
    from.data.balance = SafeBigIntMath.subtract(from.data.balance, depositOwed)
    group.maintenanceBalance = SafeBigIntMath.add(group.maintenanceBalance ?? BigInt(0), depositOwed)
  }

  const previousEpoch = group.epoch

  // Record the commit before mutating membership, so the transcript reads as
  // "at epoch N, this commit was applied".
  const commitRecord: Tx.GroupCommitRecord = {
    type: TXTypes.group_commit,
    txId,
    from: tx.from,
    groupId: tx.groupId,
    epoch: previousEpoch,
    commit: tx.commit,
    proposals: [...tx.proposals],
    pskId: tx.pskId,
    pskNonce: tx.pskNonce,
    addedMembers: [...tx.addedMembers],
    removedMembers: [...tx.removedMembers],
    timestamp: txTimestamp,
    sign: tx.sign,
  }
  tree.handshakes.push(commitRecord)
  /*
   * Bound the transcript.
   *
   * Pruning a commit locks out any member that has not applied it — MLS state
   * cannot be rebuilt from the public transcript, so they must reset and be
   * re-added. That is the trade: an unbounded transcript grows ~9 kB per commit
   * forever (measured at 100 members) and is transferred and re-hashed on every
   * later commit. Clients read `oldestAvailableEpoch` from the handshakes
   * endpoint and surface a reset when they fall behind it.
   */
  const maxHandshakes = config.LiberdusFlags.groupMaxHandshakes
  if (maxHandshakes > 0 && tree.handshakes.length > maxHandshakes) {
    tree.handshakes = tree.handshakes.slice(-maxHandshakes)
  }

  group.epoch = previousEpoch + 1

  const removed = new Set(tx.removedMembers)
  group.members = [...group.members.filter((m) => !removed.has(m)), ...tx.addedMembers]
  group.admins = group.admins.filter((a) => !removed.has(a))

  for (const address of tx.addedMembers) {
    group.memberSince[address] = { epoch: group.epoch, timestamp: txTimestamp }

    /*
     * Approving a request consumes it, and its escrow is earned by the admin who
     * did the approving — `from`, not the group and not whoever created it.
     *
     * joinFee is zero until paid groups ship, so this moves nothing today. When
     * it does, §5.2 of the consent spec adds a vesting delay here so that
     * "take the fee, remove the member" can be refunded rather than clawed back.
     */
    const request = tree.pendingJoinRequests[address]
    if (request) {
      /*
       * The fee does NOT land in the admin's balance yet.
       *
       * Paying immediately would make "take the fee, remove the member" a scam
       * that has to be undone by clawing money back from someone who may
       * already have spent it. Vesting inverts that: until `vestingUntil` the
       * money is still recoverable, so removing the member simply returns it
       * (see the removal loop below). Only after the window does the admin
       * become able to claim it. Same shape as a 1:1 toll, which is likewise
       * conditional rather than immediate.
       */
      if (request.escrow > BigInt(0)) {
        tree.vestedFees.push({
          admin: tx.from,
          member: address,
          amount: request.escrow,
          vestingUntil: txTimestamp + config.LiberdusFlags.groupJoinFeeVestingMs,
        })
      }
      delete tree.pendingJoinRequests[address]
    }
  }
  // Approving members clears their requests, so the mirrored count moves too.
  utils.syncPendingJoinCount(group, tree)
  for (const address of tx.removedMembers) {
    delete group.memberSince[address]
    delete group.lastMessageAt[address]
    delete tree.pendingWelcomes[address]

    /*
     * Removed before their join fee vested: give it back.
     *
     * This is what makes the vesting window meaningful rather than decorative —
     * the money is returned automatically, from an account nobody has been paid
     * from yet, instead of having to be recovered from the admin afterwards.
     * A member who LEAVES is not refunded (group_leave does not run this), or
     * every paid group would be a free trial.
     */
    const stillVesting = tree.vestedFees.filter((v) => v.member === address && v.vestingUntil > txTimestamp)
    if (stillVesting.length > 0) {
      const refundee: UserAccount = wrappedStates[address] && wrappedStates[address].data
      if (refundee && isUserAccount(refundee)) {
        for (const v of stillVesting) {
          refundee.data.balance = SafeBigIntMath.add(refundee.data.balance, v.amount)
        }
        refundee.timestamp = txTimestamp
      }
      tree.vestedFees = tree.vestedFees.filter((v) => !(v.member === address && v.vestingUntil > txTimestamp))
    }
  }

  /*
   * Advance the stored ratchet tree.
   *
   * A baseline replaces it wholesale; otherwise the delta is applied by node
   * index. This is pure data movement — the network does no MLS cryptography and
   * cannot check that the delta is honest. It does not need to: RFC 9420
   * requires a joiner to verify the tree against the `tree_hash` in the
   * GroupContext carried in its Welcome, so a committer who publishes a corrupt
   * tree is caught by the joiner and cannot forge one that hashes correctly.
   */
  if (tx.ratchetTree.length > 0) {
    tree.ratchetTree = tx.ratchetTree
  } else {
    tree.ratchetTree = applyTreeDelta(tree.ratchetTree, tx.treeDelta)
  }
  tree.treeEpoch = group.epoch

  /*
   * Drop the sender's own pending welcome.
   *
   * Welcomes are collected over a GET, which cannot mutate consensus state, so
   * nothing else ever removed them — they accumulated for the life of the group,
   * and each one carries a full tree snapshot. A commit signed by that member is
   * proof they joined, and under the update-on-join rule every joiner sends one
   * almost immediately.
   */
  delete tree.pendingWelcomes[tx.from]

  /*
   * Backstop for an invitee that never joins and never commits: their welcome is
   * addressed to an epoch whose keys have long rotated, so it is useless to them
   * and merely expensive to keep. Bounded by the roster either way, but this
   * keeps a group that repeatedly invites no-shows from carrying them forever.
   */
  for (const [address, envelope] of Object.entries(tree.pendingWelcomes)) {
    if (group.epoch - (envelope.epoch || 0) > WELCOME_RETENTION_EPOCHS) {
      delete tree.pendingWelcomes[address]
    }
  }

  /*
   * Park each Welcome for collection, and take ONE tree snapshot for the epoch.
   *
   * The joiner needs the tree matching the GroupContext in its Welcome, but the
   * live tree moves on immediately — under update-on-join the very next commit is
   * the joiner's own path update. The snapshot costs zero transaction bytes,
   * since the assembled tree is already in hand.
   *
   * Keyed by epoch rather than stored per joiner: everyone added in one commit
   * shares the same tree, and at 100 members that tree is ~354 kB — a per-joiner
   * copy made a 10-member add write 3.5 MB.
   */
  for (const welcome of tx.welcomes) {
    tree.pendingWelcomes[welcome.address] = {
      ...welcome.envelope,
      // Who did the adding. The invitee's client needs this to say "X added you"
      // when asking whether to accept, and nothing else records it — the commit
      // transcript is pruned, and the roster does not say who admitted whom.
      addedBy: tx.from,
      epoch: group.epoch,
      timestamp: txTimestamp,
    }
  }
  if (tx.welcomes.length > 0) {
    tree.welcomeTrees[String(group.epoch)] = tree.ratchetTree
  }

  // Drop snapshots no pending welcome refers to any more.
  const neededEpochs = new Set(Object.values(tree.pendingWelcomes).map((w) => String(w.epoch)))
  for (const epoch of Object.keys(tree.welcomeTrees)) {
    if (!neededEpochs.has(epoch)) delete tree.welcomeTrees[epoch]
  }

  /*
   * Checkpoint every commit. A member who was offline while older commits were
   * pruned can rejoin from this GroupInfo via an external commit; without it
   * they would be locked out permanently.
   */
  /*
   * No tree copy here. The checkpoint is rewritten on every commit, so its epoch
   * always equals treeEpoch and its tree would be byte-identical to
   * `tree.ratchetTree` — it was storing the whole thing twice. Consumers read
   * `tree.ratchetTree` when `checkpoint.epoch === tree.treeEpoch`.
   */
  tree.checkpoint = {
    epoch: group.epoch,
    groupInfo: tx.groupInfo,
    timestamp: txTimestamp,
  }

  if (typeof tx.meta === 'string' && tx.meta.length > 0) {
    group.meta = tx.meta
  }

  // Consume the single-use KeyPackages this commit used up.
  for (const consumed of tx.consumedKeyPackages) {
    const addee: UserAccount = wrappedStates[consumed.address].data
    if (Array.isArray(addee.data.mlsKeyPackages)) {
      addee.data.mlsKeyPackages = addee.data.mlsKeyPackages.filter((kp) => kp !== consumed.keyPackage)
    }
    addee.timestamp = txTimestamp
  }

  /*
   * Point each added member's client at the group through the chats map, and
   * bump chatTimestamp so the collector long-poll wakes them. This reuses the
   * existing discovery path, so a new member needs no new notification channel
   * and still finds the group after a week offline.
   */
  for (const address of tx.addedMembers) {
    const addee: UserAccount = wrappedStates[address].data
    addee.data.chats[tx.groupId] = {
      receivedTimestamp: txTimestamp,
      chatId: tx.groupId,
    }
    addee.data.chatTimestamp = txTimestamp
    addee.timestamp = txTimestamp
  }

  for (const address of tx.removedMembers) {
    const removee: UserAccount = wrappedStates[address] && wrappedStates[address].data
    if (removee && removee.data && removee.data.chats) {
      delete removee.data.chats[tx.groupId]
      removee.data.chatTimestamp = txTimestamp
      removee.timestamp = txTimestamp
    }
  }

  group.timestamp = txTimestamp
  tree.timestamp = txTimestamp
  from.timestamp = txTimestamp

  const appReceiptData: AppReceiptData = {
    txId,
    timestamp: txTimestamp,
    success: true,
    from: tx.from,
    to: tx.groupId,
    type: tx.type,
    transactionFee,
    additionalInfo: {
      groupId: tx.groupId,
      epoch: group.epoch,
      addedMembers: tx.addedMembers,
      removedMembers: tx.removedMembers,
    },
  }
  const appReceiptDataHash = crypto.hashObj(appReceiptData)
  dapp.applyResponseAddReceiptData(applyResponse, appReceiptData, appReceiptDataHash)
  dapp.log('Applied group_commit tx', tx.groupId, `epoch ${previousEpoch} -> ${group.epoch}`)
}

export const createFailedAppReceiptData = (
  tx: Tx.GroupCommit,
  txTimestamp: number,
  txId: string,
  wrappedStates: WrappedStates,
  dapp: Shardus,
  applyResponse: ShardusTypes.ApplyResponse,
  reason: string,
): void => {
  const from: UserAccount = wrappedStates[tx.from] && wrappedStates[tx.from].data
  let transactionFee = BigInt(0)
  if (from !== undefined && from !== null) {
    const networkFee = utils.getTransactionFeeWei(AccountsStorage.cachedNetworkAccount)
    if (from.data.balance >= networkFee) {
      transactionFee = networkFee
      from.data.balance = SafeBigIntMath.subtract(from.data.balance, transactionFee)
    } else {
      transactionFee = from.data.balance
      from.data.balance = BigInt(0)
    }
    from.timestamp = txTimestamp
  }

  const appReceiptData: AppReceiptData = {
    txId,
    timestamp: txTimestamp,
    success: false,
    reason,
    from: tx.from,
    to: tx.groupId,
    type: tx.type,
    transactionFee,
    additionalInfo: { groupId: tx.groupId, epoch: tx.epoch },
  }
  const appReceiptDataHash = crypto.hashObj(appReceiptData)
  dapp.applyResponseAddReceiptData(applyResponse, appReceiptData, appReceiptDataHash)
}

/**
 * Added and removed members are targets because their accounts are written:
 * added members get the group pointer and lose a KeyPackage, removed members
 * lose the pointer. Bounded by groupMaxMembersPerCommit, so unlike
 * group_message this stays a small key set even for large groups.
 */
export const keys = (tx: Tx.GroupCommit, result: ShardusTypes.TransactionKeys): ShardusTypes.TransactionKeys => {
  result.sourceKeys = [tx.from]
  // The tree account is a separate address, so it must be named here or apply()
  // cannot write it. group_message deliberately does NOT name it.
  /*
   * The chat account for each (adder, addee) pair carries the toll setting that
   * says whether the addee accepts invitations from this account, so it has to
   * be loaded for validate() to read. Read-only — see memoryPattern.
   */
  const connectionChats = tx.addedMembers.map((address) => utils.calculateChatId(address, tx.from))
  result.targetKeys = [
    tx.groupId,
    utils.calculateGroupTreeId(tx.groupId),
    ...tx.addedMembers,
    ...tx.removedMembers,
    ...connectionChats,
  ]
  result.allKeys = [...result.sourceKeys, ...result.targetKeys]
  return result
}

export const memoryPattern = (tx: Tx.GroupCommit, result: ShardusTypes.TransactionKeys): ShardusTypes.ShardusMemoryPatternsInput => {
  return {
    rw: [tx.from, tx.groupId, utils.calculateGroupTreeId(tx.groupId), ...tx.addedMembers, ...tx.removedMembers],
    wo: [],
    on: [],
    // Connection chats are only read, never written, by a commit.
    ri: tx.addedMembers.map((address) => utils.calculateChatId(address, tx.from)),
    ro: [],
  }
}

export const createRelevantAccount = (
  dapp: Shardus,
  account: UserAccount | GroupAccount | GroupTreeAccount | ChatAccount,
  accountId: string,
  tx: Tx.GroupCommit,
  accountCreated = false,
): ShardusTypes.WrappedResponse => {
  /*
   * The tree account is created lazily rather than by group_create, so groups
   * that predate the split get one on their first commit. That commit is also
   * the one that publishes the baseline `ratchetTree` (see apply), so the pair
   * becomes consistent in a single step.
   */
  if (!account && accountId === utils.calculateGroupTreeId(tx.groupId)) {
    account = create.groupTreeAccount(accountId, tx.groupId)
    accountCreated = true
  }
  /*
   * Two accounts that have never chatted have no chat account, and therefore no
   * toll setting for validate() to read — the transaction would otherwise fail
   * opaquely on a missing account rather than with a reason.
   *
   * The default construction waives only the INITIATOR's toll (chatAccount sets
   * required[senderIndex] = 0 so a replier is not charged), leaving the addee's
   * at 1. validate() reads the addee's slot, so this materialises exactly the
   * "not connected" state and the add is refused with a clear message.
   */
  if (!account && tx.addedMembers.some((address) => utils.calculateChatId(address, tx.from) === accountId)) {
    const addee = tx.addedMembers.find((address) => utils.calculateChatId(address, tx.from) === accountId)
    account = create.chatAccount(accountId, { from: tx.from, to: addee } as Tx.Message)
    accountCreated = true
  }
  if (!account) {
    throw Error('Account must exist in order to commit to a group')
  }
  return dapp.createWrappedResponse(accountId, accountCreated, account.hash, account.timestamp, account)
}
