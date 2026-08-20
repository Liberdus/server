import * as crypto from '../crypto'
import { Shardus, ShardusTypes } from '@shardus/core'
import * as utils from '../utils'
import { UserAccount, GroupTreeAccount, WrappedStates, Tx, AppReceiptData } from '../@types'
import { SafeBigIntMath } from '../utils/safeBigIntMath'
import * as AccountsStorage from '../storage/accountStorage'
import { isUserAccount, isGroupTreeAccount } from '../@types/accountTypeGuards'

/**
 * Withdraws a pending join request and returns its escrow.
 *
 * The counterpart to reclaim_toll: money the other side never earned comes back
 * to the person who put it up. An admin who ignores a request is not refusing
 * it — silence is how a group declines, because making the group pay a fee to
 * say "no" to a spammer would be backwards — so the requester needs a way to
 * take their money and their request back.
 *
 * Unlike reclaim_toll there is no timeout to wait out. A pending request has no
 * counterparty mid-transaction to protect: nobody has done work on the strength
 * of it, so trapping the requester's funds would serve no one. Withdrawing
 * before approval is always allowed.
 */
export const validate_fields = (
  tx: Tx.GroupJoinReclaim,
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
  tx: Tx.GroupJoinReclaim,
  wrappedStates: WrappedStates,
  response: ShardusTypes.IncomingTransactionResult,
  dapp: Shardus,
): ShardusTypes.IncomingTransactionResult => {
  const from: UserAccount = wrappedStates[tx.from] && wrappedStates[tx.from].data
  const treeId = utils.calculateGroupTreeId(tx.groupId)
  const tree: GroupTreeAccount = wrappedStates[treeId] && wrappedStates[treeId].data

  if (typeof from === 'undefined' || from === null || !isUserAccount(from)) {
    response.reason = '"from" account does not exist.'
    return response
  }
  if (!tree || !isGroupTreeAccount(tree)) {
    response.reason = 'this group has no pending requests.'
    return response
  }
  /*
   * Only the requester may move this money. The request is keyed by address and
   * the transaction is signed by tx.from, so there is no way to reclaim on
   * someone else's behalf.
   */
  if (!tree.pendingJoinRequests[tx.from]) {
    response.reason = 'no pending join request from this account.'
    return response
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
  tx: Tx.GroupJoinReclaim,
  txTimestamp: number,
  txId: string,
  wrappedStates: WrappedStates,
  dapp: Shardus,
  applyResponse: ShardusTypes.ApplyResponse,
): void => {
  const from: UserAccount = wrappedStates[tx.from].data
  const treeId = utils.calculateGroupTreeId(tx.groupId)
  const tree: GroupTreeAccount = wrappedStates[treeId].data

  const transactionFee = utils.getTransactionFeeWei(AccountsStorage.cachedNetworkAccount)
  from.data.balance = SafeBigIntMath.subtract(from.data.balance, transactionFee)

  const request = tree.pendingJoinRequests[tx.from]
  const refund = request ? request.escrow : BigInt(0)
  from.data.balance = SafeBigIntMath.add(from.data.balance, refund)
  delete tree.pendingJoinRequests[tx.from]

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
    additionalInfo: { groupId: tx.groupId, refunded: refund.toString() },
  }
  const appReceiptDataHash = crypto.hashObj(appReceiptData)
  dapp.applyResponseAddReceiptData(applyResponse, appReceiptData, appReceiptDataHash)
  dapp.log('Applied group_join_reclaim tx', tx.groupId, tx.from, refund)
}

export const createFailedAppReceiptData = (
  tx: Tx.GroupJoinReclaim,
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

export const keys = (tx: Tx.GroupJoinReclaim, result: ShardusTypes.TransactionKeys): ShardusTypes.TransactionKeys => {
  result.sourceKeys = [tx.from]
  result.targetKeys = [utils.calculateGroupTreeId(tx.groupId)]
  result.allKeys = [...result.sourceKeys, ...result.targetKeys]
  return result
}

export const memoryPattern = (
  tx: Tx.GroupJoinReclaim,
  result: ShardusTypes.TransactionKeys,
): ShardusTypes.ShardusMemoryPatternsInput => {
  return { rw: [tx.from, utils.calculateGroupTreeId(tx.groupId)], wo: [], on: [], ri: [], ro: [] }
}

export const createRelevantAccount = (
  dapp: Shardus,
  account: UserAccount | GroupTreeAccount,
  accountId: string,
  tx: Tx.GroupJoinReclaim,
  accountCreated = false,
): ShardusTypes.WrappedResponse => {
  if (!account) {
    throw Error('Account must exist in order to reclaim a join request')
  }
  return dapp.createWrappedResponse(accountId, accountCreated, account.hash, account.timestamp, account)
}
