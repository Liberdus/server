import _ from 'lodash';
import { Shardus, ShardusTypes } from '@shardus/core'
import * as config from '../config'
import * as crypto from '@shardus/crypto-utils'
import create from '../accounts'

export const validate_fields = (tx: Tx.ApplyDevParameters, response: ShardusTypes.IncomingTransactionResult) => {
  if (typeof tx.devIssue !== 'number') {
    response.success = false
    response.reason = 'tx "devIssue" field must be a number.'
    throw new Error(response.reason)
  }
  if (_.isEmpty(tx.devWindows)) {
    response.success = false
    response.reason = 'tx "devWindows" field must not be empty.'
    throw new Error(response.reason)
  }
  if (!_.isEmpty(tx.nextDevWindows)) {
    response.success = false
    response.reason = 'tx "nextDevWindows" field must be an empty object.'
    throw new Error(response.reason)
  }
  if (!Array.isArray(tx.developerFund)) {
    response.success = false
    response.reason = 'tx "developerFund" field must be an array.'
    throw new Error(response.reason)
  }
  if (!_.isEmpty(tx.nextDeveloperFund) || !Array.isArray(tx.nextDeveloperFund)) {
    response.success = false
    response.reason = 'tx "nextDeveloperFund" field must be an empty array.'
    throw new Error(response.reason)
  }
  return response
}

export const validate = (tx: Tx.ApplyDevParameters, wrappedStates: WrappedStates, response: ShardusTypes.IncomingTransactionResult, dapp: Shardus) => {
  response.success = true
  response.reason = 'This transaction is valid!'
  return response
}

export const apply = (tx: Tx.ApplyDevParameters, txTimestamp: number, txId: string, wrappedStates: WrappedStates, dapp: Shardus) => {
  const network: NetworkAccount = wrappedStates[config.networkAccount].data
  network.devWindows = tx.devWindows
  network.nextDevWindows = tx.nextDevWindows
  network.developerFund = tx.developerFund
  network.nextDeveloperFund = tx.nextDeveloperFund
  network.devIssue = tx.devIssue
  network.timestamp = txTimestamp
}

export const keys = (tx: Tx.ApplyDevParameters, result: TransactionKeys) => {
  result.targetKeys = [config.networkAccount]
  result.allKeys = [...result.sourceKeys, ...result.targetKeys]
  return result
}

export const createRelevantAccount = (dapp: Shardus, account: NodeAccount, accountId: string, tx: Tx.ApplyDevParameters, accountCreated = false) => {
  if (!account) {
    account = create.nodeAccount(accountId)
    accountCreated = true
  }
  return dapp.createWrappedResponse(accountId, accountCreated, account.hash, account.timestamp, account)
}
