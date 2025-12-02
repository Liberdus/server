import { Utils } from '@shardeum-foundation/lib-types'
import { Shardus, ShardusTypes } from '@shardeum-foundation/core'
import { NetworkAccount, WrappedStates, Tx, AppReceiptData } from '../@types'
import * as crypto from '../crypto'

import _ from 'lodash'
import * as config from '../config'

export const validate_fields = (tx: Tx.ApplyTally, response: ShardusTypes.IncomingTransactionResult): ShardusTypes.IncomingTransactionResult => {
  if (_.isEmpty(tx.next) || typeof tx.next !== 'object') {
    response.reason = 'tx "next" field must be a non empty object'
    return response
  }
  if (_.isEmpty(tx.nextWindows) || typeof tx.nextWindows !== 'object') {
    response.reason = 'tx "nextWindows" field must be a non empty object'
    return response
  }
  if (typeof tx.next.title !== 'string') {
    response.reason = 'tx "next parameter title" field must be a string.'
    return response
  }
  if (typeof tx.next.description !== 'string') {
    response.reason = 'tx "next parameter description" field must be a string.'
    return response
  }
  if (typeof tx.next.nodeRewardInterval !== 'number') {
    response.reason = 'tx "next parameter nodeRewardInterval" field must be a number.'
    return response
  }
  if (typeof tx.next.nodeRewardAmountUsdStr !== 'string') {
    response.reason = 'tx "next parameter nodeRewardAmountUsdStr" field must be a string.'
    return response
  }
  if (typeof tx.next.nodePenaltyUsdStr !== 'string') {
    response.reason = 'tx "next parameter nodePenaltyUsdStr" field must be a string.'
    return response
  }
  if (typeof tx.next.transactionFeeUsdStr !== 'string') {
    response.reason = 'tx "next parameter transactionFeeUsdStr" field must be a string.'
    return response
  }
  if (typeof tx.next.stakeRequiredUsdStr !== 'string') {
    response.reason = 'tx "next parameter stakeRequiredUsdStr" field must be a string.'
    return response
  }
  if (typeof tx.next.maintenanceInterval !== 'number') {
    response.reason = 'tx "next parameter maintenanceInterval" field must be a number.'
    return response
  }
  if (typeof tx.next.maintenanceFee !== 'bigint') {
    response.reason = 'tx "next parameter maintenanceFee" field must be a bigint.'
    return response
  }
  if (typeof tx.next.proposalFee !== 'bigint') {
    response.reason = 'tx "next parameter proposalFee" field must be a bigint.'
    return response
  }
  if (typeof tx.next.devProposalFee !== 'bigint') {
    response.reason = 'tx "next parameter devProposalFee" field must be a bigint.'
    return response
  }
  if (typeof tx.next.faucetAmount !== 'bigint') {
    response.reason = 'tx "next parameter faucetAmount" field must be a bigint.'
    return response
  }
  if (typeof tx.next.transactionFeeUsdStr !== 'string') {
    response.reason = 'tx "next parameter transactionFeeUsdStr" field must be a string.'
    return response
  }
  response.success = true
  return response
}

export const validate = (
  tx: Tx.ApplyTally,
  wrappedStates: WrappedStates,
  response: ShardusTypes.IncomingTransactionResult,
  dapp: Shardus,
): ShardusTypes.IncomingTransactionResult => {
  response.success = true
  response.reason = 'This transaction is valid!'
  return response
}

export const apply = (
  tx: Tx.ApplyTally,
  txTimestamp: number,
  txId: string,
  wrappedStates: WrappedStates,
  dapp: Shardus,
  applyResponse: ShardusTypes.ApplyResponse,
): void => {
  const network: NetworkAccount = wrappedStates[config.networkAccount].data
  network.next = tx.next
  network.nextWindows = tx.nextWindows
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
  dapp.log(`APPLIED TALLY GLOBAL ${Utils.safeStringify(network)} ===`)
}

export const createFailedAppReceiptData = (
  tx: Tx.ApplyTally,
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

export const keys = (tx: Tx.ApplyTally, result: ShardusTypes.TransactionKeys): ShardusTypes.TransactionKeys => {
  result.targetKeys = [config.networkAccount]
  result.allKeys = [...result.sourceKeys, ...result.targetKeys]
  return result
}

export const memoryPattern = (tx: Tx.ApplyTally, result: ShardusTypes.TransactionKeys): ShardusTypes.ShardusMemoryPatternsInput => {
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
  tx: Tx.ApplyTally,
  accountCreated = false,
): ShardusTypes.WrappedResponse => {
  if (!account) {
    throw new Error('Network Account must already exist for the apply_tally transaction')
  }
  return dapp.createWrappedResponse(accountId, accountCreated, account.hash, account.timestamp, account)
}
