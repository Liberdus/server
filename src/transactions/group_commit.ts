import * as crypto from '../crypto'
import { Shardus, ShardusTypes } from '@shardus/core'
import * as utils from '../utils'
import * as config from '../config'
import { UserAccount, GroupAccount, WrappedStates, Tx, AppReceiptData, TXTypes } from '../@types'
import { SafeBigIntMath } from '../utils/safeBigIntMath'
import * as AccountsStorage from '../storage/accountStorage'
import { isUserAccount, isGroupAccount } from '../@types/accountTypeGuards'

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

  const totalBytes =
    Buffer.byteLength(tx.commit, 'utf8') +
    Buffer.byteLength(tx.groupInfo, 'utf8') +
    Buffer.byteLength(tx.ratchetTree, 'utf8') +
    tx.proposals.reduce((sum, p) => sum + Buffer.byteLength(String(p), 'utf8'), 0)
  if (totalBytes / 1024 > config.LiberdusFlags.groupMessageSizeLimit) {
    response.reason = `commit payload exceeds ${config.LiberdusFlags.groupMessageSizeLimit} kB.`
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

export const validate = (
  tx: Tx.GroupCommit,
  wrappedStates: WrappedStates,
  response: ShardusTypes.IncomingTransactionResult,
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
  if (from.data.balance < transactionFee) {
    response.reason = `from account does not have sufficient funds ${from.data.balance} to cover the transaction fee (${transactionFee}).`
    return response
  }

  response.success = true
  response.reason = 'This transaction is valid!'
  return response
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

  const transactionFee = utils.getTransactionFeeWei(AccountsStorage.cachedNetworkAccount)
  from.data.balance = SafeBigIntMath.subtract(from.data.balance, transactionFee)

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
  group.handshakes.push(commitRecord)

  group.epoch = previousEpoch + 1

  const removed = new Set(tx.removedMembers)
  group.members = [...group.members.filter((m) => !removed.has(m)), ...tx.addedMembers]
  group.admins = group.admins.filter((a) => !removed.has(a))

  for (const address of tx.addedMembers) {
    group.memberSince[address] = { epoch: group.epoch, timestamp: txTimestamp }
  }
  for (const address of tx.removedMembers) {
    delete group.memberSince[address]
    delete group.lastMessageAt[address]
    delete group.pendingWelcomes[address]
  }

  // Park each Welcome (and its sealed PQ PSK) for collection by the new member.
  for (const welcome of tx.welcomes) {
    group.pendingWelcomes[welcome.address] = {
      ...welcome.envelope,
      epoch: group.epoch,
      timestamp: txTimestamp,
    }
  }

  /*
   * Checkpoint every commit. A member who was offline while older commits were
   * pruned can rejoin from this GroupInfo via an external commit; without it
   * they would be locked out permanently.
   */
  group.checkpoint = {
    epoch: group.epoch,
    groupInfo: tx.groupInfo,
    ratchetTree: tx.ratchetTree,
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
  result.targetKeys = [tx.groupId, ...tx.addedMembers, ...tx.removedMembers]
  result.allKeys = [...result.sourceKeys, ...result.targetKeys]
  return result
}

export const memoryPattern = (tx: Tx.GroupCommit, result: ShardusTypes.TransactionKeys): ShardusTypes.ShardusMemoryPatternsInput => {
  return {
    rw: [tx.from, tx.groupId, ...tx.addedMembers, ...tx.removedMembers],
    wo: [],
    on: [],
    ri: [],
    ro: [],
  }
}

export const createRelevantAccount = (
  dapp: Shardus,
  account: UserAccount | GroupAccount,
  accountId: string,
  tx: Tx.GroupCommit,
  accountCreated = false,
): ShardusTypes.WrappedResponse => {
  if (!account) {
    throw Error('Account must exist in order to commit to a group')
  }
  return dapp.createWrappedResponse(accountId, accountCreated, account.hash, account.timestamp, account)
}
