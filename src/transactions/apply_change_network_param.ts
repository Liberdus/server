import { Utils } from '@shardus/types'
import { Shardus, ShardusTypes } from '@shardeum-foundation/core'
import * as config from '../config'
import { AppReceiptData, NetworkAccount, NodeAccount, TransactionKeys, Tx, WrappedStates } from '../@types'
import * as crypto from '../crypto'

export const validate_fields = (tx: Tx.ApplyChangeNetworkParam, response: ShardusTypes.IncomingTransactionResult) => {
  return response
}

export const validate = (tx: Tx.ApplyChangeNetworkParam, wrappedStates: WrappedStates, response: ShardusTypes.IncomingTransactionResult, dapp: Shardus) => {
  response.success = true
  response.reason = 'This transaction is valid!'
  return response
}

export const apply = (
  tx: Tx.ApplyChangeNetworkParam,
  txTimestamp: number,
  txId: string,
  wrappedStates: WrappedStates,
  dapp: Shardus,
  applyResponse: ShardusTypes.ApplyResponse,
): void => {
  const network: NetworkAccount = wrappedStates[config.networkAccount].data
  network.listOfChanges.push(tx.change)
  network.timestamp = txTimestamp

  const appReceiptData: AppReceiptData = {
    txId,
    timestamp: txTimestamp,
    success: true,
    from: tx.from,
    to: config.networkAccount,
    type: tx.type,
    transactionFee: BigInt(0),
    additionalInfo: {
      change: tx.change,
    },
  }
  const appReceiptDataHash = crypto.hashObj(appReceiptData)
  dapp.applyResponseAddReceiptData(applyResponse, appReceiptData, appReceiptDataHash)
  dapp.log(`=== APPLIED CHANGE_NETWORK_PARAM GLOBAL ${Utils.safeStringify(network)} ===`)
}

export const createFailedAppReceiptData = (
  tx: Tx.ApplyChangeNetworkParam,
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
    additionalInfo: {
      change: tx.change,
    },
  }
  const appReceiptDataHash = crypto.hashObj(appReceiptData)
  dapp.applyResponseAddReceiptData(applyResponse, appReceiptData, appReceiptDataHash)
}

export const keys = (tx: Tx.ApplyChangeNetworkParam, result: TransactionKeys) => {
  result.targetKeys = [config.networkAccount]
  result.allKeys = [...result.sourceKeys, ...result.targetKeys]
  return result
}

export const memoryPattern = (tx: Tx.ApplyChangeNetworkParam, result: TransactionKeys): ShardusTypes.ShardusMemoryPatternsInput => {
  return {
    rw: [config.networkAccount],
    wo: [],
    on: [],
    ri: [],
    ro: [],
  }
}

export const createRelevantAccount = (dapp: Shardus, account: NodeAccount, accountId: string, tx: Tx.ApplyChangeNetworkParam, accountCreated = false) => {
  if (!account) {
    throw Error('Account must exist in order to perform a apply_change_network_param transaction')
  }
  return dapp.createWrappedResponse(accountId, accountCreated, account.hash, account.timestamp, account)
}
