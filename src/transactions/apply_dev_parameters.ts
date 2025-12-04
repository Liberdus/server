import _ from 'lodash'
import { Shardus, ShardusTypes } from '@shardus/core'
import * as config from '../config'
import * as crypto from '../crypto'
import { Utils } from '@shardus/lib-types'
import { NetworkAccount, WrappedStates, Tx, AppReceiptData } from '../@types'

export const validate_fields = (tx: Tx.ApplyDevParameters, response: ShardusTypes.IncomingTransactionResult): ShardusTypes.IncomingTransactionResult => {
  if (typeof tx.devIssue !== 'number') {
    response.reason = 'tx "devIssue" field must be a number.'
    return response
  }
  if (_.isEmpty(tx.devWindows)) {
    response.reason = 'tx "devWindows" field must not be empty.'
    return response
  }
  if (!_.isEmpty(tx.nextDevWindows)) {
    response.reason = 'tx "nextDevWindows" field must be an empty object.'
    return response
  }
  if (!Array.isArray(tx.developerFund)) {
    response.reason = 'tx "developerFund" field must be an array.'
    return response
  }
  if (!_.isEmpty(tx.nextDeveloperFund) || !Array.isArray(tx.nextDeveloperFund)) {
    response.reason = 'tx "nextDeveloperFund" field must be an empty array.'
    return response
  }
  response.success = true
  return response
}

export const validate = (
  tx: Tx.ApplyDevParameters,
  wrappedStates: WrappedStates,
  response: ShardusTypes.IncomingTransactionResult,
  dapp: Shardus,
): ShardusTypes.IncomingTransactionResult => {
  response.success = true
  response.reason = 'This transaction is valid!'
  return response
}

export const apply = (
  tx: Tx.ApplyDevParameters,
  txTimestamp: number,
  txId: string,
  wrappedStates: WrappedStates,
  dapp: Shardus,
  applyResponse: ShardusTypes.ApplyResponse,
): void => {
  const network: NetworkAccount = wrappedStates[config.networkAccount].data
  network.devWindows = tx.devWindows
  network.nextDevWindows = tx.nextDevWindows
  network.developerFund = tx.developerFund
  network.nextDeveloperFund = tx.nextDeveloperFund
  network.devIssue = tx.devIssue
  network.timestamp = txTimestamp

  const appReceiptData: AppReceiptData = {
    txId,
    timestamp: txTimestamp,
    success: true,
    from: tx.from,
    to: config.networkAccount,
    type: tx.type,
    transactionFee: BigInt(0),
  }
  const appReceiptDataHash = crypto.hashObj(appReceiptData)
  dapp.applyResponseAddReceiptData(applyResponse, appReceiptData, appReceiptDataHash)
  dapp.log(`=== APPLIED DEV_PARAMETERS GLOBAL ${Utils.safeStringify(network)} ===`)
}

export const createFailedAppReceiptData = (
  tx: Tx.ApplyDevParameters,
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
    to: config.networkAccount,
    type: tx.type,
    transactionFee: BigInt(0),
  }
  const appReceiptDataHash = crypto.hashObj(appReceiptData)
  dapp.applyResponseAddReceiptData(applyResponse, appReceiptData, appReceiptDataHash)
}

export const keys = (tx: Tx.ApplyDevParameters, result: ShardusTypes.TransactionKeys): ShardusTypes.TransactionKeys => {
  result.targetKeys = [config.networkAccount]
  result.allKeys = [...result.sourceKeys, ...result.targetKeys]
  return result
}
export const memoryPattern = (tx: Tx.ApplyDevParameters, result: ShardusTypes.TransactionKeys): ShardusTypes.ShardusMemoryPatternsInput => {
  return {
    rw: [config.networkAccount],
    wo: [],
    on: [],
    ri: [],
    ro: [],
  }
}

export const createRelevantAccount = (
  dapp: Shardus,
  account: NetworkAccount,
  accountId: string,
  tx: Tx.ApplyDevParameters,
  accountCreated = false,
): ShardusTypes.WrappedResponse => {
  if (!account) {
    throw new Error('Network Account must already exist for the apply_dev_parameters transaction')
  }
  return dapp.createWrappedResponse(accountId, accountCreated, account.hash, account.timestamp, account)
}
