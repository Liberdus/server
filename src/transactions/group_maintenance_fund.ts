import * as crypto from '../crypto'
import { Shardus, ShardusTypes } from '@shardus/core'
import * as utils from '../utils'
import { UserAccount, GroupAccount, WrappedStates, Tx, AppReceiptData } from '../@types'
import { SafeBigIntMath } from '../utils/safeBigIntMath'
import * as AccountsStorage from '../storage/accountStorage'
import { isUserAccount, isGroupAccount } from '../@types/accountTypeGuards'

/**
 * Tops up the balance a group spends repairing its own ratchet tree.
 *
 * Removing a member blanks the departing leaf's ancestors, and some member has
 * to commit a path update to fill them in. group_commit pays that fee out of
 * GroupAccount.maintenanceBalance rather than charging whoever happened to
 * perform it. This is how the balance gets refilled between the deposits that
 * group_commit collects when members are added.
 *
 * Open to anyone. The balance is spendable on exactly one thing -- burning the
 * fee on a repair commit -- and there is no withdrawal transaction anywhere in
 * the system, so a contribution cannot be redirected or taken back out. That is
 * what makes it safe to let a stranger pay, and uninteresting to steal.
 */
export const validate_fields = (
  tx: Tx.GroupMaintenanceFund,
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
  if (typeof tx.amount !== 'bigint') {
    response.reason = 'tx "amount" must be a bigint.'
    return response
  }
  if (tx.amount <= BigInt(0)) {
    response.reason = 'tx "amount" must be greater than zero.'
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
  tx: Tx.GroupMaintenanceFund,
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

  // Membership is deliberately not required; see the note at the top.

  const transactionFee = utils.getTransactionFeeWei(AccountsStorage.cachedNetworkAccount)
  if (transactionFee > tx.fee) {
    response.reason = `The network transaction fee (${transactionFee}) is greater than the transaction fee provided (${tx.fee}).`
    return response
  }
  if (from.data.balance < SafeBigIntMath.add(transactionFee, tx.amount)) {
    response.reason = `from account does not have sufficient funds ${from.data.balance} to cover the transaction fee (${transactionFee}) and the contribution (${tx.amount}).`
    return response
  }

  response.success = true
  response.reason = 'This transaction is valid!'
  return response
}

export const apply = (
  tx: Tx.GroupMaintenanceFund,
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

  // The fee is burned; the contribution is not. It moves into the group, where
  // its only exit is the fee on a future repair commit.
  from.data.balance = SafeBigIntMath.subtract(from.data.balance, tx.amount)
  // `?? 0` covers a group serialized before maintenanceBalance existed.
  group.maintenanceBalance = SafeBigIntMath.add(group.maintenanceBalance ?? BigInt(0), tx.amount)

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
      contributed: tx.amount.toString(),
      maintenanceBalance: group.maintenanceBalance.toString(),
    },
  }
  const appReceiptDataHash = crypto.hashObj(appReceiptData)
  dapp.applyResponseAddReceiptData(applyResponse, appReceiptData, appReceiptDataHash)
  dapp.log('Applied group_maintenance_fund tx', tx.groupId, tx.from, tx.amount)
}

export const createFailedAppReceiptData = (
  tx: Tx.GroupMaintenanceFund,
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
    type: tx.type,
    to: tx.groupId,
    transactionFee,
    additionalInfo: { groupId: tx.groupId },
  }
  const appReceiptDataHash = crypto.hashObj(appReceiptData)
  dapp.applyResponseAddReceiptData(applyResponse, appReceiptData, appReceiptDataHash)
}

export const keys = (
  tx: Tx.GroupMaintenanceFund,
  result: ShardusTypes.TransactionKeys,
): ShardusTypes.TransactionKeys => {
  result.sourceKeys = [tx.from]
  // The GroupAccount only. maintenanceBalance lives there, and nothing here
  // touches the ratchet tree.
  result.targetKeys = [tx.groupId]
  result.allKeys = [...result.sourceKeys, ...result.targetKeys]
  return result
}

export const memoryPattern = (
  tx: Tx.GroupMaintenanceFund,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  result: ShardusTypes.TransactionKeys,
): ShardusTypes.ShardusMemoryPatternsInput => {
  return { rw: [tx.from, tx.groupId], wo: [], on: [], ri: [], ro: [] }
}

export const createRelevantAccount = (
  dapp: Shardus,
  account: UserAccount | GroupAccount,
  accountId: string,
  tx: Tx.GroupMaintenanceFund,
  accountCreated = false,
): ShardusTypes.WrappedResponse => {
  if (!account) {
    throw Error('Account must exist in order to fund group maintenance')
  }
  return dapp.createWrappedResponse(accountId, accountCreated, account.hash, account.timestamp, account)
}
