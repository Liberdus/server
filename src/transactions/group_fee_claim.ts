import * as crypto from '../crypto'
import { Shardus, ShardusTypes } from '@shardus/core'
import * as utils from '../utils'
import { UserAccount, GroupTreeAccount, WrappedStates, Tx, AppReceiptData } from '../@types'
import { SafeBigIntMath } from '../utils/safeBigIntMath'
import * as AccountsStorage from '../storage/accountStorage'
import { isUserAccount, isGroupTreeAccount } from '../@types/accountTypeGuards'

/** Fees this admin has earned and that have finished vesting. */
const matured = (tree: GroupTreeAccount, admin: string, now: number): bigint =>
  (tree.vestedFees || [])
    .filter((v) => v.admin === admin && v.vestingUntil <= now)
    .reduce((sum, v) => SafeBigIntMath.add(sum, v.amount), BigInt(0))

/**
 * Collects join fees that have finished vesting.
 *
 * An approved join fee is not paid out immediately: until `vestingUntil` it can
 * still be returned to the member if they are removed, which is what stops
 * "take the fee, remove them" from being a cheap scam. This is the other half —
 * once the window has passed, the admin who did the approving collects.
 *
 * Deliberately a separate transaction rather than a sweep during group_commit:
 * an admin should be able to collect without having to make a membership change
 * to trigger it, and a group with no activity should not strand its fees.
 */
export const validate_fields = (
  tx: Tx.GroupFeeClaim,
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
  tx: Tx.GroupFeeClaim,
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
    response.reason = 'this group has no fees to claim.'
    return response
  }
  /*
   * Timestamps come from the transaction, not Date.now(), so every validator
   * reaches the same answer about what has matured.
   */
  if (matured(tree, tx.from, tx.timestamp) <= BigInt(0)) {
    response.reason = 'no join fees have finished vesting for this account.'
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
  tx: Tx.GroupFeeClaim,
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

  const amount = matured(tree, tx.from, txTimestamp)
  from.data.balance = SafeBigIntMath.add(from.data.balance, amount)
  tree.vestedFees = (tree.vestedFees || []).filter((v) => !(v.admin === tx.from && v.vestingUntil <= txTimestamp))

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
    additionalInfo: { groupId: tx.groupId, claimed: amount.toString() },
  }
  const appReceiptDataHash = crypto.hashObj(appReceiptData)
  dapp.applyResponseAddReceiptData(applyResponse, appReceiptData, appReceiptDataHash)
  dapp.log('Applied group_fee_claim tx', tx.groupId, tx.from, amount)
}

export const createFailedAppReceiptData = (
  tx: Tx.GroupFeeClaim,
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

export const keys = (tx: Tx.GroupFeeClaim, result: ShardusTypes.TransactionKeys): ShardusTypes.TransactionKeys => {
  result.sourceKeys = [tx.from]
  result.targetKeys = [utils.calculateGroupTreeId(tx.groupId)]
  result.allKeys = [...result.sourceKeys, ...result.targetKeys]
  return result
}

export const memoryPattern = (
  tx: Tx.GroupFeeClaim,
  result: ShardusTypes.TransactionKeys,
): ShardusTypes.ShardusMemoryPatternsInput => {
  return { rw: [tx.from, utils.calculateGroupTreeId(tx.groupId)], wo: [], on: [], ri: [], ro: [] }
}

export const createRelevantAccount = (
  dapp: Shardus,
  account: UserAccount | GroupTreeAccount,
  accountId: string,
  tx: Tx.GroupFeeClaim,
  accountCreated = false,
): ShardusTypes.WrappedResponse => {
  if (!account) {
    throw Error('Account must exist in order to claim group fees')
  }
  return dapp.createWrappedResponse(accountId, accountCreated, account.hash, account.timestamp, account)
}
