import { Utils } from '@shardus/types'
import _ from 'lodash'
import { Shardus, ShardusTypes } from '@shardus/core'
import create from '../accounts'
import * as config from '../config'
import { Accounts, UserAccount, NetworkAccount, IssueAccount, WrappedStates, ProposalAccount, Tx, TransactionKeys } from '../@types'

export const validate_fields = (tx: Tx.ApplyParameters, response: ShardusTypes.IncomingTransactionResult) => {
  console.log('apply_parameters validate_fields tx', tx)
  if (_.isEmpty(tx.current) || typeof tx.current !== 'object') {
    response.success = false
    response.reason = 'tx "current" field must not be a non empty object'
    throw new Error(response.reason)
  }
  if (typeof tx.current.title !== 'string') {
    response.success = false
    response.reason = 'tx "current parameter title" field must be a string.'
    throw new Error(response.reason)
  }
  if (typeof tx.current.description !== 'string') {
    response.success = false
    response.reason = 'tx "current parameter description" field must be a string.'
    throw new Error(response.reason)
  }
  if (typeof tx.current.nodeRewardInterval !== 'number') {
    response.success = false
    response.reason = 'tx "current parameter nodeRewardInterval" field must be a number.'
    throw new Error(response.reason)
  }
  if (typeof tx.current.nodeRewardAmountUsd !== 'bigint') {
    response.success = false
    response.reason = 'tx "current parameter nodeRewardAmount" field must be a bigint.'
    throw new Error(response.reason)
  }
  if (typeof tx.current.nodePenaltyUsd !== 'bigint') {
    response.success = false
    response.reason = 'tx "current parameter nodePenalty" field must be a bigint.'
    throw new Error(response.reason)
  }
  if (typeof tx.current.transactionFee !== 'bigint') {
    response.success = false
    response.reason = 'tx "current parameter transactionFee" field must be a bigint.'
    throw new Error(response.reason)
  }
  if (typeof tx.current.stakeRequiredUsd !== 'bigint') {
    response.success = false
    response.reason = 'tx "current parameter stakeRequired" field must be a bigint.'
    throw new Error(response.reason)
  }
  if (typeof tx.current.maintenanceInterval !== 'number') {
    response.success = false
    response.reason = 'tx "current parameter maintenanceInterval" field must be a number.'
    throw new Error(response.reason)
  }
  if (typeof tx.current.maintenanceFee !== 'bigint') {
    response.success = false
    response.reason = 'tx "current parameter maintenanceFee" field must be a bigint.'
    throw new Error(response.reason)
  }
  if (typeof tx.current.proposalFee !== 'bigint') {
    response.success = false
    response.reason = 'tx "current parameter proposalFee" field must be a bigint.'
    throw new Error(response.reason)
  }
  if (typeof tx.current.devProposalFee !== 'bigint') {
    response.success = false
    response.reason = 'tx "current parameter devProposalFee" field must be a bigint.'
    throw new Error(response.reason)
  }
  if (typeof tx.current.faucetAmount !== 'bigint') {
    response.success = false
    response.reason = 'tx "current parameter faucetAmount" field must be a bigint.'
    throw new Error(response.reason)
  }
  if (typeof tx.current.transactionFee !== 'bigint') {
    response.success = false
    response.reason = 'tx "current parameter defaultToll" field must be a number.'
    throw new Error(response.reason)
  }
  if (!_.isEmpty(tx.next) || typeof tx.next !== 'object') {
    response.success = false
    response.reason = 'tx "next" field must be an empty object.'
    throw new Error(response.reason)
  }
  if (_.isEmpty(tx.windows) || typeof tx.windows !== 'object') {
    response.success = false
    response.reason = 'tx "windows" field must be a non empty object.'
    throw new Error(response.reason)
  }
  if (!_.isEmpty(tx.nextWindows)) {
    response.success = false
    response.reason = 'tx "nextWindows" field must be an empty object.'
    throw new Error(response.reason)
  }
  if (typeof tx.issue !== 'number') {
    response.success = false
    response.reason = 'tx "issue" field must be a number.'
    throw new Error(response.reason)
  }
  return response
}

export const validate = (tx: Tx.ApplyParameters, wrappedStates: WrappedStates, response: ShardusTypes.IncomingTransactionResult, dapp: Shardus) => {
  response.success = true
  response.reason = 'This transaction is valid!'
  return response
}

export const apply = (tx: Tx.ApplyParameters, txTimestamp: number, txId: string, wrappedStates: WrappedStates, dapp: Shardus) => {
  const network: NetworkAccount = wrappedStates[config.networkAccount].data
  network.current = tx.current
  network.next = tx.next
  network.windows = tx.windows
  network.nextWindows = tx.nextWindows
  network.issue = tx.issue
  if (tx.devWindows) network.devWindows = tx.devWindows
  if (tx.nextDevWindows) network.nextDevWindows = tx.nextDevWindows
  network.timestamp = txTimestamp
  dapp.log(`Applied apply_parameters tx ${txId}`, tx, network)
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
