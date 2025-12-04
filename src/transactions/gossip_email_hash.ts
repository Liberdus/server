import { Shardus, ShardusTypes } from '@shardus/core'
import create from '../accounts'
import * as config from '../config'
import { NodeAccount, UserAccount, NetworkAccount, IssueAccount, WrappedStates, ProposalAccount, Tx, AppReceiptData } from '../@types'
import * as crypto from '../crypto'
import * as utils from '../utils'

export const validate_fields = (tx: Tx.GossipEmailHash, response: ShardusTypes.IncomingTransactionResult): ShardusTypes.IncomingTransactionResult => {
  if (utils.isValidAddress(tx.nodeId) === false) {
    response.reason = 'tx "nodeId" is not a valid address.'
    return response
  }
  if (utils.isValidAddress(tx.from) === false) {
    response.reason = 'tx "from" is not a valid address.'
    return response
  }
  if (typeof tx.account !== 'string') {
    response.reason = 'tx "account" field must be a string.'
    return response
  }
  if (typeof tx.emailHash !== 'string') {
    response.reason = 'tx "emailHash" field must be a string.'
    return response
  }
  if (typeof tx.verified !== 'string') {
    response.reason = 'tx "verified" field must be a string.'
    return response
  }
  // [TODO] - Add tx sign validation
  response.success = true
  return response
}

export const validate = (
  tx: Tx.GossipEmailHash,
  wrappedStates: WrappedStates,
  response: ShardusTypes.IncomingTransactionResult,
  dapp: Shardus,
): ShardusTypes.IncomingTransactionResult => {
  response.success = true
  response.reason = 'This transaction is valid!'
  return response
}

export const apply = (
  tx: Tx.GossipEmailHash,
  txTimestamp: number,
  txId: string,
  wrappedStates: WrappedStates,
  dapp: Shardus,
  applyResponse: ShardusTypes.ApplyResponse,
): void => {
  // const targets = tx.targets.map(target => wrappedStates[target].data)
  const account: UserAccount = wrappedStates[tx.account].data
  account.emailHash = tx.emailHash
  account.verified = tx.verified
  account.timestamp = txTimestamp

  const appReceiptData: AppReceiptData = {
    txId,
    timestamp: txTimestamp,
    success: true,
    from: tx.account,
    to: tx.account,
    type: tx.type,
    transactionFee: BigInt(0),
  }
  const appReceiptDataHash = crypto.hashObj(appReceiptData)
  dapp.applyResponseAddReceiptData(applyResponse, appReceiptData, appReceiptDataHash)
  dapp.log('Applied gossip_email_hash tx', account)
}

export const createFailedAppReceiptData = (
  tx: Tx.GossipEmailHash,
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
    from: tx.account,
    to: tx.account,
    type: tx.type,
    transactionFee: BigInt(0),
  }
  const appReceiptDataHash = crypto.hashObj(appReceiptData)
  dapp.applyResponseAddReceiptData(applyResponse, appReceiptData, appReceiptDataHash)
}

export const keys = (tx: Tx.GossipEmailHash, result: ShardusTypes.TransactionKeys): ShardusTypes.TransactionKeys => {
  result.sourceKeys = [tx.from]
  result.targetKeys = [tx.account]
  result.allKeys = [...result.sourceKeys, ...result.targetKeys]
  return result
}

export const memoryPattern = (tx: Tx.GossipEmailHash, result: ShardusTypes.TransactionKeys): ShardusTypes.ShardusMemoryPatternsInput => {
  return {
    rw: [tx.from],
    wo: [],
    on: [],
    ri: [],
    ro: [],
  }
}

export const createRelevantAccount = (
  dapp: Shardus,
  account: NodeAccount,
  accountId: string,
  tx: Tx.GossipEmailHash,
  accountCreated = false,
): ShardusTypes.WrappedResponse => {
  if (!account) {
    account = create.nodeAccount(accountId)
    accountCreated = true
  }
  return dapp.createWrappedResponse(accountId, accountCreated, account.hash, account.timestamp, account)
}
