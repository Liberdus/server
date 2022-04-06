import stringify from 'fast-stable-stringify'
import _ from 'lodash'
import { Shardus, ShardusTypes } from '@shardus/core'
import create from '../accounts'
import * as config from '../config'

export const validate_fields = (tx: Tx.ApplyParameters, response: ShardusTypes.IncomingTransactionResult) => {
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
  if (typeof tx.current.nodeRewardAmount !== 'number') {
    response.success = false
    response.reason = 'tx "current parameter nodeRewardAmount" field must be a number.'
    throw new Error(response.reason)
  }
  if (typeof tx.current.nodePenalty !== 'number') {
    response.success = false
    response.reason = 'tx "current parameter nodePenalty" field must be a number.'
    throw new Error(response.reason)
  }
  if (typeof tx.current.transactionFee !== 'number') {
    response.success = false
    response.reason = 'tx "current parameter transactionFee" field must be a number.'
    throw new Error(response.reason)
  }
  if (typeof tx.current.stakeRequired !== 'number') {
    response.success = false
    response.reason = 'tx "current parameter stakeRequired" field must be a number.'
    throw new Error(response.reason)
  }
  if (typeof tx.current.maintenanceInterval !== 'number') {
    response.success = false
    response.reason = 'tx "current parameter maintenanceInterval" field must be a number.'
    throw new Error(response.reason)
  }
  if (typeof tx.current.maintenanceFee !== 'number') {
    response.success = false
    response.reason = 'tx "current parameter maintenanceFee" field must be a number.'
    throw new Error(response.reason)
  }
  if (typeof tx.current.proposalFee !== 'number') {
    response.success = false
    response.reason = 'tx "current parameter proposalFee" field must be a number.'
    throw new Error(response.reason)
  }
  if (typeof tx.current.devProposalFee !== 'number') {
    response.success = false
    response.reason = 'tx "current parameter devProposalFee" field must be a number.'
    throw new Error(response.reason)
  }
  if (typeof tx.current.faucetAmount !== 'number') {
    response.success = false
    response.reason = 'tx "current parameter faucetAmount" field must be a number.'
    throw new Error(response.reason)
  }
  if (typeof tx.current.transactionFee !== 'number') {
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
  network.timestamp = txTimestamp
  dapp.log(`=== APPLIED PARAMETERS GLOBAL ${stringify(network)} ===`)
}

export const keys = (tx: Tx.ApplyParameters, result: TransactionKeys) => {
  result.targetKeys = [config.networkAccount]
  result.allKeys = [...result.sourceKeys, ...result.targetKeys]
  return result
}

export const createRelevantAccount = (dapp: Shardus, account: NodeAccount, accountId: string, tx: Tx.ApplyParameters, accountCreated = false) => {
  if (!account) {
    account = create.nodeAccount(accountId)
    accountCreated = true
  }
  return dapp.createWrappedResponse(accountId, accountCreated, account.hash, account.timestamp, account)
}
