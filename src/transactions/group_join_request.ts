import * as crypto from '../crypto'
import { Shardus, ShardusTypes } from '@shardus/core'
import * as utils from '../utils'
import * as config from '../config'
import create from '../accounts'
import { UserAccount, GroupAccount, GroupTreeAccount, WrappedStates, Tx, AppReceiptData } from '../@types'
import { SafeBigIntMath } from '../utils/safeBigIntMath'
import * as AccountsStorage from '../storage/accountStorage'
import { isUserAccount, isGroupAccount } from '../@types/accountTypeGuards'

/**
 * Asks to join a group.
 *
 * This is the consent artefact. group_commit requires a matching request before
 * it will admit anyone (unless the addee separately allows direct adds), which
 * is what stops an account being pulled into a group it never asked for —
 * spending its KeyPackages and, under update-on-join, its money.
 *
 * Carries NO KeyPackage. The approving commit draws one from the requester's
 * published pool instead: pinning a package here would break if the requester
 * rotated their pool while the request was pending, because publishing discards
 * the private halves and the Welcome would become undecryptable.
 *
 * The escrow follows the toll model in `message`: the requester's balance is
 * debited now and the amount recorded as a claim on the group, earned by the
 * approving admin or reclaimed by the requester (see group_join_reclaim).
 * joinFee is zero until paid groups ship, so today this is a no-op that keeps
 * the shape correct.
 */
export const validate_fields = (
  tx: Tx.GroupJoinRequest,
  response: ShardusTypes.IncomingTransactionResult,
): ShardusTypes.IncomingTransactionResult => {
  if (utils.isValidAddress(tx.from) === false) {
    response.reason = 'tx "from" is not a valid address.'
    return response
  }
  if (utils.isValidAddress(tx.groupId) === false) {
    response.reason = 'tx "groupId" is not a valid address.'
    return response
  }
  if (typeof tx.escrow !== 'bigint' || tx.escrow < BigInt(0)) {
    response.reason = 'tx "escrow" must be a non-negative bigint.'
    return response
  }
  if (typeof tx.message !== 'string') {
    response.reason = 'tx "message" must be a string.'
    return response
  }
  if (tx.message.length > config.LiberdusFlags.groupMaxJoinRequestMessageLength) {
    response.reason = `tx "message" must be at most ${config.LiberdusFlags.groupMaxJoinRequestMessageLength} characters.`
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
  tx: Tx.GroupJoinRequest,
  wrappedStates: WrappedStates,
  response: ShardusTypes.IncomingTransactionResult,
  dapp: Shardus,
): ShardusTypes.IncomingTransactionResult => {
  const from: UserAccount = wrappedStates[tx.from] && wrappedStates[tx.from].data
  const group: GroupAccount = wrappedStates[tx.groupId] && wrappedStates[tx.groupId].data
  const treeId = utils.calculateGroupTreeId(tx.groupId)
  const tree: GroupTreeAccount = wrappedStates[treeId] && wrappedStates[treeId].data

  if (typeof from === 'undefined' || from === null) {
    response.reason = '"from" account does not exist.'
    return response
  }
  if (!isUserAccount(from)) {
    response.reason = 'from account is not a UserAccount'
    return response
  }
  if (typeof group === 'undefined' || group === null || !isGroupAccount(group)) {
    response.reason = '"groupId" account does not exist.'
    return response
  }
  if (group.members.includes(tx.from)) {
    response.reason = 'already a member of this group.'
    return response
  }
  if (Array.isArray(group.blocked) && group.blocked.includes(tx.from)) {
    response.reason = 'this group is not accepting requests from you.'
    return response
  }
  if (group.members.length >= group.maxMembers) {
    response.reason = 'the group is full.'
    return response
  }
  if (tree && tree.pendingJoinRequests[tx.from]) {
    response.reason = 'a join request from this account is already pending.'
    return response
  }
  if (tree && Object.keys(tree.pendingJoinRequests).length >= config.LiberdusFlags.groupMaxPendingJoinRequests) {
    response.reason = 'this group has too many pending join requests; try again later.'
    return response
  }
  /*
   * The escrow must match the advertised price exactly. Because the escrowed
   * amount IS the consent, an admin who raises joinFee afterwards can only ever
   * be paid what was agreed here — no separate "max fee" rule is needed.
   */
  if (tx.escrow !== group.joinFee) {
    response.reason = `tx "escrow" (${tx.escrow}) must equal the group's join fee (${group.joinFee}).`
    return response
  }

  const transactionFee = utils.getTransactionFeeWei(AccountsStorage.cachedNetworkAccount)
  if (transactionFee > tx.fee) {
    response.success = false
    response.reason = `The network transaction fee (${transactionFee}) is greater than the transaction fee provided (${tx.fee}).`
    return response
  }
  if (from.data.balance < transactionFee + tx.escrow) {
    response.reason = `from account does not have sufficient funds ${from.data.balance} to cover the join fee (${tx.escrow}) + transaction fee (${transactionFee}).`
    return response
  }

  response.success = true
  response.reason = 'This transaction is valid!'
  return response
}

export const apply = (
  tx: Tx.GroupJoinRequest,
  txTimestamp: number,
  txId: string,
  wrappedStates: WrappedStates,
  dapp: Shardus,
  applyResponse: ShardusTypes.ApplyResponse,
): void => {
  const from: UserAccount = wrappedStates[tx.from].data
  const group: GroupAccount = wrappedStates[tx.groupId] && wrappedStates[tx.groupId].data
  const treeId = utils.calculateGroupTreeId(tx.groupId)
  const tree: GroupTreeAccount = wrappedStates[treeId] && wrappedStates[treeId].data

  if (!tree) {
    throw Error('getRelevantAccount must create the GroupTreeAccount before apply')
  }

  const transactionFee = utils.getTransactionFeeWei(AccountsStorage.cachedNetworkAccount)
  from.data.balance = SafeBigIntMath.subtract(from.data.balance, transactionFee)
  // Held, not spent: reclaimable by the requester until an admin approves.
  from.data.balance = SafeBigIntMath.subtract(from.data.balance, tx.escrow)

  tree.pendingJoinRequests[tx.from] = {
    escrow: tx.escrow,
    message: tx.message,
    timestamp: txTimestamp,
  }
  /*
   * Mirror the count onto the group account. That is the account an admin's
   * client already polls, so this is what lets an open Group info page notice
   * the request without anyone loading the ratchet tree.
   */
  utils.syncPendingJoinCount(group, tree)
  if (group) group.timestamp = txTimestamp

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
    additionalInfo: { groupId: tx.groupId, escrow: tx.escrow.toString() },
  }
  const appReceiptDataHash = crypto.hashObj(appReceiptData)
  dapp.applyResponseAddReceiptData(applyResponse, appReceiptData, appReceiptDataHash)
  dapp.log('Applied group_join_request tx', tx.groupId, tx.from)
}

export const createFailedAppReceiptData = (
  tx: Tx.GroupJoinRequest,
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
    additionalInfo: { groupId: tx.groupId },
  }
  const appReceiptDataHash = crypto.hashObj(appReceiptData)
  dapp.applyResponseAddReceiptData(applyResponse, appReceiptData, appReceiptDataHash)
}

export const keys = (tx: Tx.GroupJoinRequest, result: ShardusTypes.TransactionKeys): ShardusTypes.TransactionKeys => {
  result.sourceKeys = [tx.from]
  // The group account is read (roster, blocked, joinFee); the tree account is
  // written (the request itself).
  result.targetKeys = [tx.groupId, utils.calculateGroupTreeId(tx.groupId)]
  result.allKeys = [...result.sourceKeys, ...result.targetKeys]
  return result
}

export const memoryPattern = (
  tx: Tx.GroupJoinRequest,
  result: ShardusTypes.TransactionKeys,
): ShardusTypes.ShardusMemoryPatternsInput => {
  return {
    rw: [tx.from, utils.calculateGroupTreeId(tx.groupId)],
    wo: [],
    on: [],
    ri: [tx.groupId],
    ro: [],
  }
}

export const createRelevantAccount = (
  dapp: Shardus,
  account: UserAccount | GroupAccount | GroupTreeAccount,
  accountId: string,
  tx: Tx.GroupJoinRequest,
  accountCreated = false,
): ShardusTypes.WrappedResponse => {
  if (!account && accountId === utils.calculateGroupTreeId(tx.groupId)) {
    account = create.groupTreeAccount(accountId, tx.groupId)
    accountCreated = true
  }
  if (!account) {
    throw Error('Account must exist in order to request to join a group')
  }
  return dapp.createWrappedResponse(accountId, accountCreated, account.hash, account.timestamp, account)
}
