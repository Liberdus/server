import * as crypto from '../crypto'
import { Shardus, ShardusTypes } from '@shardus/core'
import * as utils from '../utils'
import { UserAccount, GroupAccount, GroupTreeAccount, WrappedStates, Tx, AppReceiptData } from '../@types'
import { SafeBigIntMath } from '../utils/safeBigIntMath'
import * as AccountsStorage from '../storage/accountStorage'
import { isUserAccount, isGroupAccount, isGroupTreeAccount } from '../@types/accountTypeGuards'

/** How many requests one decline may clear. Each requester's account is a key. */
export const MAX_DECLINES_PER_TX = 10

/**
 * The admin turns down pending join requests, and their escrow goes back.
 *
 * Silence used to be the only way a group declined, which left an admin with no
 * answer to a flood of requests: they held the group's pending slots until each
 * requester chose to withdraw, and real requests were refused meanwhile (threat
 * model T8). Now the admin can clear them, a batch at a time, for one fee per
 * batch -- far less than the flood cost to send. Expiry (see
 * utils.isJoinRequestLive) clears them eventually even if nobody acts.
 *
 * The requesters' accounts are named in the transaction, which is what lets
 * their escrow be returned here rather than left for them to reclaim.
 */
export const validate_fields = (
  tx: Tx.GroupJoinDecline,
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
  if (!Array.isArray(tx.requesters) || tx.requesters.length === 0 || tx.requesters.length > MAX_DECLINES_PER_TX) {
    response.reason = `tx "requesters" must list between 1 and ${MAX_DECLINES_PER_TX} addresses.`
    return response
  }
  if (tx.requesters.some((a) => utils.isValidAddress(a) === false)) {
    response.reason = 'tx "requesters" contains an invalid address.'
    return response
  }
  if (new Set(tx.requesters).size !== tx.requesters.length) {
    response.reason = 'tx "requesters" contains duplicates.'
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
  tx: Tx.GroupJoinDecline,
  wrappedStates: WrappedStates,
  response: ShardusTypes.IncomingTransactionResult,
  dapp: Shardus,
): ShardusTypes.IncomingTransactionResult => {
  const from: UserAccount = wrappedStates[tx.from] && wrappedStates[tx.from].data
  const group: GroupAccount = wrappedStates[tx.groupId] && wrappedStates[tx.groupId].data
  const treeId = utils.calculateGroupTreeId(tx.groupId)
  const tree: GroupTreeAccount = wrappedStates[treeId] && wrappedStates[treeId].data

  if (typeof from === 'undefined' || from === null || !isUserAccount(from)) {
    response.reason = '"from" account does not exist.'
    return response
  }
  if (typeof group === 'undefined' || group === null || !isGroupAccount(group)) {
    response.reason = '"groupId" account does not exist.'
    return response
  }
  if (!group.admins.includes(tx.from)) {
    response.reason = 'only an admin may decline join requests.'
    return response
  }
  if (!tree || !isGroupTreeAccount(tree)) {
    response.reason = 'this group has no pending requests.'
    return response
  }
  for (const address of tx.requesters) {
    if (!tree.pendingJoinRequests[address]) {
      response.reason = `no pending join request from ${address}.`
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
  tx: Tx.GroupJoinDecline,
  txTimestamp: number,
  txId: string,
  wrappedStates: WrappedStates,
  dapp: Shardus,
  applyResponse: ShardusTypes.ApplyResponse,
): void => {
  const from: UserAccount = wrappedStates[tx.from].data
  const group: GroupAccount = wrappedStates[tx.groupId].data
  const treeId = utils.calculateGroupTreeId(tx.groupId)
  const tree: GroupTreeAccount = wrappedStates[treeId].data

  const transactionFee = utils.getTransactionFeeWei(AccountsStorage.cachedNetworkAccount)
  from.data.balance = SafeBigIntMath.subtract(from.data.balance, transactionFee)

  let refunded = BigInt(0)
  for (const address of tx.requesters) {
    const request = tree.pendingJoinRequests[address]
    if (!request) continue
    const requester: UserAccount = wrappedStates[address] && wrappedStates[address].data
    // Without the account there is nobody to pay; the request then stays, and
    // its requester can still reclaim it, rather than the escrow vanishing.
    if (request.escrow > BigInt(0)) {
      if (!requester || !isUserAccount(requester)) continue
      requester.data.balance = SafeBigIntMath.add(requester.data.balance, request.escrow)
      requester.timestamp = txTimestamp
      refunded = SafeBigIntMath.add(refunded, request.escrow)
    }
    delete tree.pendingJoinRequests[address]
  }
  utils.pruneExpiredJoinRequests(tree, txTimestamp)
  utils.syncPendingJoinCount(group, tree, txTimestamp)

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
    additionalInfo: { groupId: tx.groupId, declined: tx.requesters, refunded: refunded.toString() },
  }
  const appReceiptDataHash = crypto.hashObj(appReceiptData)
  dapp.applyResponseAddReceiptData(applyResponse, appReceiptData, appReceiptDataHash)
  dapp.log('Applied group_join_decline tx', tx.groupId, tx.from, tx.requesters.length)
}

export const createFailedAppReceiptData = (
  tx: Tx.GroupJoinDecline,
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

export const keys = (tx: Tx.GroupJoinDecline, result: ShardusTypes.TransactionKeys): ShardusTypes.TransactionKeys => {
  result.sourceKeys = [tx.from]
  // The group (admins, the mirrored pending count), the tree (the requests),
  // and each requester, whose escrow is returned.
  result.targetKeys = [tx.groupId, utils.calculateGroupTreeId(tx.groupId), ...tx.requesters]
  result.allKeys = [...result.sourceKeys, ...result.targetKeys]
  return result
}

export const memoryPattern = (
  tx: Tx.GroupJoinDecline,
  result: ShardusTypes.TransactionKeys,
): ShardusTypes.ShardusMemoryPatternsInput => {
  return { rw: [tx.from, tx.groupId, utils.calculateGroupTreeId(tx.groupId), ...tx.requesters], wo: [], on: [], ri: [], ro: [] }
}

export const createRelevantAccount = (
  dapp: Shardus,
  account: UserAccount | GroupAccount | GroupTreeAccount,
  accountId: string,
  tx: Tx.GroupJoinDecline,
  accountCreated = false,
): ShardusTypes.WrappedResponse => {
  if (!account) {
    throw Error('Account must exist in order to decline a join request')
  }
  return dapp.createWrappedResponse(accountId, accountCreated, account.hash, account.timestamp, account)
}
