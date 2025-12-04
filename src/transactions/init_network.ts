import { Utils } from '@shardus/lib-types'
import { Shardus, ShardusTypes } from '@shardus/core'
import * as config from '../config'
import create from '../accounts'
import { NodeAccount, NetworkAccount, WrappedStates, Tx, AppReceiptData } from '../@types'
import * as crypto from '../crypto'

export const validate_fields = (tx: Tx.InitNetwork, response: ShardusTypes.IncomingTransactionResult): ShardusTypes.IncomingTransactionResult => {
  response.success = true
  return response
}

export const validate = (
  tx: Tx.InitNetwork,
  wrappedStates: WrappedStates,
  response: ShardusTypes.IncomingTransactionResult,
  dapp: Shardus,
): ShardusTypes.IncomingTransactionResult => {
  const network: NetworkAccount = wrappedStates[config.networkAccount].data

  if (typeof network === 'undefined' || network === null) {
    response.reason = "Network account doesn't exist"
    return response
  }

  if (network.id !== config.networkAccount) {
    response.reason = "Network account Id doesn't match the configuration"
    return response
  }

  response.success = true
  response.reason = 'This transaction is valid'
  return response
}

export const apply = (
  tx: Tx.InitNetwork,
  txTimestamp: number,
  txId: string,
  wrappedStates: WrappedStates,
  dapp: Shardus,
  applyResponse: ShardusTypes.ApplyResponse,
): void => {
  const network: NetworkAccount = wrappedStates[config.networkAccount].data
  network.timestamp = txTimestamp
  console.log(`init_network NETWORK_ACCOUNT: ${Utils.safeStringify(network)}`)
  // from.timestamp = txTimestamp
  const appReceiptData: AppReceiptData = {
    txId,
    timestamp: txTimestamp,
    success: true,
    from: config.networkAccount,
    to: config.networkAccount,
    type: tx.type,
    transactionFee: BigInt(0),
  }
  const appReceiptDataHash = crypto.hashObj(appReceiptData)
  dapp.applyResponseAddReceiptData(applyResponse, appReceiptData, appReceiptDataHash)
  dapp.log('Applied init_network transaction', network)
}

export const createFailedAppReceiptData = (
  tx: Tx.InitNetwork,
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
    from: config.networkAccount,
    to: config.networkAccount,
    type: tx.type,
    transactionFee: BigInt(0),
  }
  const appReceiptDataHash = crypto.hashObj(appReceiptData)
  dapp.applyResponseAddReceiptData(applyResponse, appReceiptData, appReceiptDataHash)
}

export const keys = (tx: Tx.InitNetwork, result: ShardusTypes.TransactionKeys): ShardusTypes.TransactionKeys => {
  // result.sourceKeys = [tx.from]
  result.targetKeys = [config.networkAccount]
  result.allKeys = [...result.sourceKeys, ...result.targetKeys]
  return result
}

export const memoryPattern = (tx: Tx.InitNetwork, result: ShardusTypes.TransactionKeys): ShardusTypes.ShardusMemoryPatternsInput => {
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
  account: NodeAccount | NetworkAccount,
  accountId: string,
  tx: Tx.InitNetwork,
  accountCreated = false,
): ShardusTypes.WrappedResponse => {
  if (!account) {
    if (accountId === config.networkAccount) {
      account = create.networkAccount(accountId, 0, dapp) // timestamp will be set in apply()
    } else {
      account = create.nodeAccount(accountId)
    }
    accountCreated = true
  }
  return dapp.createWrappedResponse(accountId, accountCreated, account.hash, account.timestamp, account)
}
