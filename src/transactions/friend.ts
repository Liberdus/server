import * as crypto from '../crypto'
import { Shardus, ShardusTypes } from '@shardeum-foundation/core'
import * as utils from '../utils'
import create from '../accounts'
import * as config from '../config'
import { Accounts, UserAccount, NetworkAccount, IssueAccount, WrappedStates, ProposalAccount, Tx, TransactionKeys, AppReceiptData } from '../@types'
import { SafeBigIntMath } from '../utils/safeBigIntMath'
import * as AccountsStorage from '../storage/accountStorage'

export const validate_fields = (tx: Tx.Friend, response: ShardusTypes.IncomingTransactionResult) => {
  if (typeof tx.from !== 'string') {
    response.reason = 'tx "from" field must be a string.'
    return response
  }
  if (typeof tx.to !== 'string') {
    response.reason = 'tx "to" field must be a string.'
    return response
  }
  if (typeof tx.alias !== 'string') {
    response.reason = 'tx "alias" field must be a string.'
    return response
  }
  response.success = true
  return response
}

export const validate = (tx: Tx.Friend, wrappedStates: WrappedStates, response: ShardusTypes.IncomingTransactionResult, dapp: Shardus) => {
  const from: Accounts = wrappedStates[tx.from] && wrappedStates[tx.from].data
  const network: NetworkAccount = wrappedStates[config.networkAccount].data
  if (typeof from === 'undefined' || from === null) {
    response.reason = 'from account does not exist'
    return response
  }
  if (tx.sign.owner !== tx.from) {
    response.reason = 'not signed by from account'
    return response
  }
  if (crypto.verifyObj(tx) === false) {
    response.reason = 'incorrect signing'
    return response
  }
  if (from.data.balance < utils.getTransactionFeeWei(AccountsStorage.cachedNetworkAccount)) {
    response.reason = "From account doesn't have enough tokens to cover the transaction fee"
    return response
  }
  response.success = true
  response.reason = 'This transaction is valid!'
  return response
}

export const apply = (
  tx: Tx.Friend,
  txTimestamp: number,
  txId: string,
  wrappedStates: WrappedStates,
  dapp: Shardus,
  applyResponse: ShardusTypes.ApplyResponse,
): void => {
  const from: UserAccount = wrappedStates[tx.from].data
  const network: NetworkAccount = wrappedStates[config.networkAccount].data
  const transactionFee = utils.getTransactionFeeWei(AccountsStorage.cachedNetworkAccount)
  const maintenanceFee = utils.maintenanceAmount(txTimestamp, from, network)
  from.data.balance = SafeBigIntMath.subtract(from.data.balance, transactionFee)
  from.data.balance = SafeBigIntMath.subtract(from.data.balance, maintenanceFee)
  from.data.friends[tx.to] = tx.alias
  // from.data.transactions.push({ ...tx, txId })
  from.timestamp = txTimestamp

  const appReceiptData: AppReceiptData = {
    txId,
    timestamp: txTimestamp,
    success: true,
    from: tx.from,
    to: tx.to,
    type: tx.type,
    transactionFee,
    additionalInfo: {
      maintenanceFee,
    },
  }
  const appReceiptDataHash = crypto.hashObj(appReceiptData)
  dapp.applyResponseAddReceiptData(applyResponse, appReceiptData, appReceiptDataHash)
  dapp.log('Applied friend tx', from)
}

export const createFailedAppReceiptData = (
  tx: Tx.Friend,
  txTimestamp: number,
  txId: string,
  wrappedStates: WrappedStates,
  dapp: Shardus,
  applyResponse: ShardusTypes.ApplyResponse,
  reason: string,
): void => {
  const appReceiptData: AppReceiptData = {
    txId,
    timestamp: txTimestamp,
    success: false,
    reason,
    from: tx.from,
    to: tx.to,
    type: tx.type,
    transactionFee: BigInt(0),
  }
  const appReceiptDataHash = crypto.hashObj(appReceiptData)
  dapp.applyResponseAddReceiptData(applyResponse, appReceiptData, appReceiptDataHash)
}

export const keys = (tx: Tx.Friend, result: TransactionKeys) => {
  result.sourceKeys = [tx.from]
  result.targetKeys = [config.networkAccount]
  result.allKeys = [...result.sourceKeys, ...result.targetKeys]
  return result
}
export const memoryPattern = (tx: Tx.Friend, result: TransactionKeys): ShardusTypes.ShardusMemoryPatternsInput => {
  return {
    rw: [tx.from],
    wo: [],
    on: [],
    ri: [],
    ro: [config.networkAccount],
  }
}

export const createRelevantAccount = (dapp: Shardus, account: UserAccount, accountId: string, tx: Tx.Friend, accountCreated = false) => {
  if (!account) {
    throw Error('Account must exist in order to send a friend transaction')
  }
  return dapp.createWrappedResponse(accountId, accountCreated, account.hash, account.timestamp, account)
}
