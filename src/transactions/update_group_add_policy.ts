import * as crypto from '../crypto'
import { Shardus, ShardusTypes } from '@shardus/core'
import * as utils from '../utils'
import { UserAccount, WrappedStates, Tx, AppReceiptData } from '../@types'
import { SafeBigIntMath } from '../utils/safeBigIntMath'
import * as AccountsStorage from '../storage/accountStorage'
import { isUserAccount } from '../@types/accountTypeGuards'

const POLICIES = ['anyone', 'contacts', 'nobody']

/**
 * Sets who may add this account to a group without it having asked to join.
 *
 * 'contacts' means accounts this one is connected to — those it has waived its
 * chat toll for (toll.required === 0), which is the relationship that replaced
 * the deprecated friends list.
 *
 * The network default is restrictive, because being added is not free for the
 * addee: it consumes one of their single-use KeyPackages and, under
 * update-on-join, makes them inject a group_commit of their own. This lets an
 * account opt into being addable by anyone, or refuse direct adds entirely and
 * accept members only through join requests.
 */
export const validate_fields = (
  tx: Tx.UpdateGroupAddPolicy,
  response: ShardusTypes.IncomingTransactionResult,
): ShardusTypes.IncomingTransactionResult => {
  if (utils.isValidAddress(tx.from) === false) {
    response.reason = 'tx "from" is not a valid address.'
    return response
  }
  if (typeof tx.policy !== 'string' || !POLICIES.includes(tx.policy)) {
    response.reason = `tx "policy" must be one of ${POLICIES.join(', ')}.`
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
  tx: Tx.UpdateGroupAddPolicy,
  wrappedStates: WrappedStates,
  response: ShardusTypes.IncomingTransactionResult,
  dapp: Shardus,
): ShardusTypes.IncomingTransactionResult => {
  const from: UserAccount = wrappedStates[tx.from] && wrappedStates[tx.from].data

  if (typeof from === 'undefined' || from === null) {
    response.reason = '"from" account does not exist.'
    return response
  }
  if (!isUserAccount(from)) {
    response.reason = 'from account is not a UserAccount'
    return response
  }

  const transactionFee = utils.getTransactionFeeWei(AccountsStorage.cachedNetworkAccount)
  if (transactionFee > tx.fee) {
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
  tx: Tx.UpdateGroupAddPolicy,
  txTimestamp: number,
  txId: string,
  wrappedStates: WrappedStates,
  dapp: Shardus,
  applyResponse: ShardusTypes.ApplyResponse,
): void => {
  const from: UserAccount = wrappedStates[tx.from].data

  const transactionFee = utils.getTransactionFeeWei(AccountsStorage.cachedNetworkAccount)
  from.data.balance = SafeBigIntMath.subtract(from.data.balance, transactionFee)

  from.data.groupAddPolicy = tx.policy
  from.timestamp = txTimestamp

  const appReceiptData: AppReceiptData = {
    txId,
    timestamp: txTimestamp,
    success: true,
    from: tx.from,
    to: tx.from,
    type: tx.type,
    transactionFee,
    additionalInfo: { policy: tx.policy },
  }
  const appReceiptDataHash = crypto.hashObj(appReceiptData)
  dapp.applyResponseAddReceiptData(applyResponse, appReceiptData, appReceiptDataHash)
  dapp.log('Applied update_group_add_policy tx', tx.from, tx.policy)
}

export const createFailedAppReceiptData = (
  tx: Tx.UpdateGroupAddPolicy,
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
    to: tx.from,
    type: tx.type,
    transactionFee,
    additionalInfo: {},
  }
  const appReceiptDataHash = crypto.hashObj(appReceiptData)
  dapp.applyResponseAddReceiptData(applyResponse, appReceiptData, appReceiptDataHash)
}

export const keys = (tx: Tx.UpdateGroupAddPolicy, result: ShardusTypes.TransactionKeys): ShardusTypes.TransactionKeys => {
  result.sourceKeys = [tx.from]
  result.targetKeys = []
  result.allKeys = [...result.sourceKeys, ...result.targetKeys]
  return result
}

export const memoryPattern = (
  tx: Tx.UpdateGroupAddPolicy,
  result: ShardusTypes.TransactionKeys,
): ShardusTypes.ShardusMemoryPatternsInput => {
  return { rw: [tx.from], wo: [], on: [], ri: [], ro: [] }
}

export const createRelevantAccount = (
  dapp: Shardus,
  account: UserAccount,
  accountId: string,
  tx: Tx.UpdateGroupAddPolicy,
  accountCreated = false,
): ShardusTypes.WrappedResponse => {
  if (!account) {
    throw Error('Account must exist in order to set a group add policy')
  }
  return dapp.createWrappedResponse(accountId, accountCreated, account.hash, account.timestamp, account)
}
