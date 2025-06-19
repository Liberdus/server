import * as crypto from '../crypto'
import { Shardus, ShardusTypes } from '@shardeum-foundation/core'
import * as config from '../config'
import create from '../accounts'
import { Accounts, UserAccount, NetworkAccount, IssueAccount, WrappedStates, ProposalAccount, Tx, TransactionKeys, AppReceiptData } from '../@types'

export const validate_fields = (tx: Tx.Snapshot, response: ShardusTypes.IncomingTransactionResult) => {
  if (typeof tx.from !== 'string') {
    response.reason = 'tx "from" field must be a string.'
    return response
  }
  if (typeof tx.snapshot !== 'object') {
    response.reason = 'tx "snapshot" field must be an object.'
    return response
  }
  response.success = true
  return response
}

export const validate = (tx: Tx.Snapshot, wrappedStates: WrappedStates, response: ShardusTypes.IncomingTransactionResult, dapp: Shardus) => {
  if (tx.sign.owner !== tx.from) {
    response.reason = 'not signed by from account'
    return response
  }
  if (crypto.verifyObj(tx) === false) {
    response.reason = 'incorrect signing'
    return response
  }
  response.success = true
  response.reason = 'This transaction is valid!'
  return response
}

export const apply = (
  tx: Tx.Snapshot,
  txTimestamp: number,
  txId: string,
  wrappedStates: WrappedStates,
  dapp: Shardus,
  applyResponse: ShardusTypes.ApplyResponse,
): void => {
  const from: UserAccount = wrappedStates[tx.from].data
  const network: NetworkAccount = wrappedStates[config.networkAccount].data
  network.snapshot = tx.snapshot
  network.timestamp = txTimestamp
  from.timestamp = txTimestamp
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
  dapp.log('Applied snapshot tx', network)
}

export const createFailedAppReceiptData = (
  tx: Tx.Snapshot,
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

export const keys = (tx: Tx.Snapshot, result: TransactionKeys) => {
  result.sourceKeys = [tx.from]
  result.targetKeys = [config.networkAccount]
  result.allKeys = [...result.sourceKeys, ...result.targetKeys]
  return result
}

export const memoryPattern = (tx: Tx.Snapshot, result: TransactionKeys): ShardusTypes.ShardusMemoryPatternsInput => {
  return {
    rw: [config.networkAccount],
    wo: [],
    on: [],
    ri: [],
    ro: [],
  }
}

export const createRelevantAccount = (dapp: Shardus, account: UserAccount, accountId: string, tx: Tx.Snapshot, accountCreated = false) => {
  if (!account) {
    throw new Error('Account must already exist for the snapshot transaction')
  }
  return dapp.createWrappedResponse(accountId, accountCreated, account.hash, account.timestamp, account)
}
