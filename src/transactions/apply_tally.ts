import stringify from 'fast-stable-stringify'
import { Shardus, ShardusTypes } from '@shardus/core'
import create from '../accounts'

import _ from 'lodash'
import * as config from '../config'

export const validate_fields = (tx: Tx.ApplyTally, response: ShardusTypes.IncomingTransactionResult) => {
  if (_.isEmpty(tx.next) || typeof tx.next !== 'object') {
    response.success = false
    response.reason = 'tx "next" field must be a non empty object'
    throw new Error(response.reason)
  }
  if (_.isEmpty(tx.nextWindows) || typeof tx.nextWindows !== 'object') {
    response.success = false
    response.reason = 'tx "nextWindows" field must be a non empty object'
    throw new Error(response.reason)
  }
  if (typeof tx.next.title !== 'string') {
    response.success = false
    response.reason = 'tx "next parameter title" field must be a string.'
    throw new Error(response.reason)
  }
  if (typeof tx.next.description !== 'string') {
    response.success = false
    response.reason = 'tx "next parameter description" field must be a string.'
    throw new Error(response.reason)
  }
  if (typeof tx.next.nodeRewardInterval !== 'number') {
    response.success = false
    response.reason = 'tx "next parameter nodeRewardInterval" field must be a number.'
    throw new Error(response.reason)
  }
  if (typeof tx.next.nodeRewardAmount !== 'number') {
    response.success = false
    response.reason = 'tx "next parameter nodeRewardAmount" field must be a number.'
    throw new Error(response.reason)
  }
  if (typeof tx.next.nodePenalty !== 'number') {
    response.success = false
    response.reason = 'tx "next parameter nodePenalty" field must be a number.'
    throw new Error(response.reason)
  }
  if (typeof tx.next.transactionFee !== 'number') {
    response.success = false
    response.reason = 'tx "next parameter transactionFee" field must be a number.'
    throw new Error(response.reason)
  }
  if (typeof tx.next.stakeRequired !== 'number') {
    response.success = false
    response.reason = 'tx "next parameter stakeRequired" field must be a number.'
    throw new Error(response.reason)
  }
  if (typeof tx.next.maintenanceInterval !== 'number') {
    response.success = false
    response.reason = 'tx "next parameter maintenanceInterval" field must be a number.'
    throw new Error(response.reason)
  }
  if (typeof tx.next.maintenanceFee !== 'number') {
    response.success = false
    response.reason = 'tx "next parameter maintenanceFee" field must be a number.'
    throw new Error(response.reason)
  }
  if (typeof tx.next.proposalFee !== 'number') {
    response.success = false
    response.reason = 'tx "next parameter proposalFee" field must be a number.'
    throw new Error(response.reason)
  }
  if (typeof tx.next.devProposalFee !== 'number') {
    response.success = false
    response.reason = 'tx "next parameter devProposalFee" field must be a number.'
    throw new Error(response.reason)
  }
  if (typeof tx.next.faucetAmount !== 'number') {
    response.success = false
    response.reason = 'tx "next parameter faucetAmount" field must be a number.'
    throw new Error(response.reason)
  }
  if (typeof tx.next.transactionFee !== 'number') {
    response.success = false
    response.reason = 'tx "next parameter defaultToll" field must be a number.'
    throw new Error(response.reason)
  }
  return response
}

export const validate = (tx: Tx.ApplyTally, wrappedStates: WrappedStates, response: ShardusTypes.IncomingTransactionResult, dapp: Shardus) => {
  response.success = true
  response.reason = 'This transaction is valid!'
  return response
}

export const apply = (tx: Tx.ApplyTally, txTimestamp: number, txId: string, wrappedStates: WrappedStates, dapp: Shardus) => {
  const network: NetworkAccount = wrappedStates[config.networkAccount].data
  network.next = tx.next
  network.nextWindows = tx.nextWindows
  network.timestamp = txTimestamp
  dapp.log(`APPLIED TALLY GLOBAL ${stringify(network)} ===`)
}

export const keys = (tx: Tx.ApplyTally, result: TransactionKeys) => {
  result.targetKeys = [config.networkAccount]
  result.allKeys = [...result.sourceKeys, ...result.targetKeys]
  return result
}

export const createRelevantAccount = (dapp: Shardus, account: NetworkAccount, accountId: string, tx: Tx.ApplyTally, accountCreated = false) => {
  if (!account) {
    throw new Error('Network Account must already exist for the apply_tally transaction')
  }
  return dapp.createWrappedResponse(accountId, accountCreated, account.hash, account.timestamp, account)
}
