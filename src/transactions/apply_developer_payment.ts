import { Utils } from '@shardeum-foundation/lib-types'
import { Shardus, ShardusTypes } from '@shardeum-foundation/core'
import * as config from '../config'
import { NetworkAccount, WrappedStates, Tx, AppReceiptData } from '../@types'
import * as crypto from '../crypto'

export const validate_fields = (tx: Tx.ApplyDevPayment, response: ShardusTypes.IncomingTransactionResult): ShardusTypes.IncomingTransactionResult => {
  if (!Array.isArray(tx.developerFund)) {
    response.reason = 'tx "developerFund" field must be an array.'
    return response
  }
  response.success = true
  return response
}

export const validate = (
  tx: Tx.ApplyDevPayment,
  wrappedStates: WrappedStates,
  response: ShardusTypes.IncomingTransactionResult,
  dapp: Shardus,
): ShardusTypes.IncomingTransactionResult => {
  response.success = true
  response.reason = 'This transaction is valid!'
  return response
}

export const apply = (
  tx: Tx.ApplyDevPayment,
  txTimestamp: number,
  txId: string,
  wrappedStates: WrappedStates,
  dapp: Shardus,
  applyResponse: ShardusTypes.ApplyResponse,
): void => {
  const network: NetworkAccount = wrappedStates[config.networkAccount].data
  network.developerFund = tx.developerFund
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
  dapp.log(`=== APPLIED DEV_PAYMENT GLOBAL ${Utils.safeStringify(network)} ===`)
}

export const createFailedAppReceiptData = (
  tx: Tx.ApplyDevPayment,
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

export const keys = (tx: Tx.ApplyDevPayment, result: ShardusTypes.TransactionKeys): ShardusTypes.TransactionKeys => {
  result.targetKeys = [config.networkAccount]
  result.allKeys = [...result.sourceKeys, ...result.targetKeys]
  return result
}

export const memoryPattern = (tx: Tx.ApplyDevPayment, result: ShardusTypes.TransactionKeys): ShardusTypes.ShardusMemoryPatternsInput => {
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
  tx: Tx.ApplyDevPayment,
  accountCreated = false,
): ShardusTypes.WrappedResponse => {
  if (!account) {
    throw new Error('Network Account must already exist for the apply_developer_payment transaction')
  }
  return dapp.createWrappedResponse(accountId, accountCreated, account.hash, account.timestamp, account)
}
