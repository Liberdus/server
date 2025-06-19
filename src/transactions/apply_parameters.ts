import { Utils } from '@shardus/types'
import _ from 'lodash'
import { Shardus, ShardusTypes } from '@shardeum-foundation/core'
import create from '../accounts'
import * as config from '../config'
import { Accounts, UserAccount, NetworkAccount, IssueAccount, WrappedStates, ProposalAccount, Tx, TransactionKeys, AppReceiptData } from '../@types'
import * as crypto from '../crypto'

export const validate_fields = (tx: Tx.ApplyParameters, response: ShardusTypes.IncomingTransactionResult) => {
  console.log('apply_parameters validate_fields tx', tx)
  if (_.isEmpty(tx.current) || typeof tx.current !== 'object') {
    response.reason = 'tx "current" field must not be a non empty object'
    return response
  }
  if (typeof tx.current.title !== 'string') {
    response.reason = 'tx "current parameter title" field must be a string.'
    return response
  }
  if (typeof tx.current.description !== 'string') {
    response.reason = 'tx "current parameter description" field must be a string.'
    return response
  }
  if (typeof tx.current.nodeRewardInterval !== 'number') {
    response.reason = 'tx "current parameter nodeRewardInterval" field must be a number.'
    return response
  }
  if (typeof tx.current.nodeRewardAmountUsd !== 'bigint') {
    response.reason = 'tx "current parameter nodeRewardAmount" field must be a bigint.'
    return response
  }
  if (typeof tx.current.nodePenaltyUsd !== 'bigint') {
    response.reason = 'tx "current parameter nodePenalty" field must be a bigint.'
    return response
  }
  if (typeof tx.current.transactionFee !== 'bigint') {
    response.reason = 'tx "current parameter transactionFee" field must be a bigint.'
    return response
  }
  if (typeof tx.current.stakeRequiredUsd !== 'bigint') {
    response.reason = 'tx "current parameter stakeRequired" field must be a bigint.'
    return response
  }
  if (typeof tx.current.maintenanceInterval !== 'number') {
    response.reason = 'tx "current parameter maintenanceInterval" field must be a number.'
    return response
  }
  if (typeof tx.current.maintenanceFee !== 'bigint') {
    response.reason = 'tx "current parameter maintenanceFee" field must be a bigint.'
    return response
  }
  if (typeof tx.current.proposalFee !== 'bigint') {
    response.reason = 'tx "current parameter proposalFee" field must be a bigint.'
    return response
  }
  if (typeof tx.current.devProposalFee !== 'bigint') {
    response.reason = 'tx "current parameter devProposalFee" field must be a bigint.'
    return response
  }
  if (typeof tx.current.faucetAmount !== 'bigint') {
    response.reason = 'tx "current parameter faucetAmount" field must be a bigint.'
    return response
  }
  if (typeof tx.current.transactionFee !== 'bigint') {
    response.reason = 'tx "current parameter defaultToll" field must be a number.'
    return response
  }
  if (!_.isEmpty(tx.next) || typeof tx.next !== 'object') {
    response.reason = 'tx "next" field must be an empty object.'
    return response
  }
  if (_.isEmpty(tx.windows) || typeof tx.windows !== 'object') {
    response.reason = 'tx "windows" field must be a non empty object.'
    return response
  }
  if (!_.isEmpty(tx.nextWindows)) {
    response.reason = 'tx "nextWindows" field must be an empty object.'
    return response
  }
  if (typeof tx.issue !== 'number') {
    response.reason = 'tx "issue" field must be a number.'
    return response
  }
  response.success = true
  return response
}

export const validate = (tx: Tx.ApplyParameters, wrappedStates: WrappedStates, response: ShardusTypes.IncomingTransactionResult, dapp: Shardus) => {
  response.success = true
  response.reason = 'This transaction is valid!'
  return response
}

export const apply = (
  tx: Tx.ApplyParameters,
  txTimestamp: number,
  txId: string,
  wrappedStates: WrappedStates,
  dapp: Shardus,
  applyResponse: ShardusTypes.ApplyResponse,
): void => {
  const network: NetworkAccount = wrappedStates[config.networkAccount].data
  network.current = tx.current
  network.next = tx.next
  network.windows = tx.windows
  network.nextWindows = tx.nextWindows
  network.issue = tx.issue
  if (tx.devWindows) network.devWindows = tx.devWindows
  if (tx.nextDevWindows) network.nextDevWindows = tx.nextDevWindows
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
  dapp.log(`Applied apply_parameters tx ${txId}`, tx, network)
}

export const createFailedAppReceiptData = (
  tx: Tx.ApplyParameters,
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

export const keys = (tx: Tx.ApplyParameters, result: TransactionKeys) => {
  result.targetKeys = [config.networkAccount]
  result.allKeys = [...result.sourceKeys, ...result.targetKeys]
  return result
}

export const memoryPattern = (tx: Tx.ApplyParameters, result: TransactionKeys): ShardusTypes.ShardusMemoryPatternsInput => {
  return {
    rw: [config.networkAccount],
    wo: [],
    on: [],
    ri: [],
    ro: [],
  }
}

export const createRelevantAccount = (dapp: Shardus, account: NetworkAccount, accountId: string, tx: Tx.ApplyParameters, accountCreated = false) => {
  if (!account) {
    throw new Error('Network Account must already exist for the apply_parameters transaction')
  }
  return dapp.createWrappedResponse(accountId, accountCreated, account.hash, account.timestamp, account)
}
