import _ from 'lodash';
import Shardus from 'shardus-global-server/src/shardus/shardus-types'
import * as config from '../config'
import * as crypto from 'shardus-crypto-utils'
import create from '../accounts'

export const validate_fields = (tx: Tx.ApplyDevParameters, response: Shardus.IncomingTransactionResult) => {
  if (typeof tx.network !== 'string') {
    response.success = false
    response.reason = 'tx "network" field must be a string.'
    throw new Error(response.reason)
  }
  if (tx.network !== config.networkAccount) {
    response.success = false
    response.reason = 'tx "network" field must be: ' + config.networkAccount
    throw new Error(response.reason)
  }
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

export const validate = (tx: Tx.ApplyDevParameters, wrappedStates: WrappedStates, response: Shardus.IncomingTransactionResult, dapp: Shardus) => {
  response.success = true
  response.reason = 'This transaction is valid!'
  return response
}

export const apply = (tx: Tx.ApplyDevParameters, txId: string, wrappedStates: WrappedStates, dapp: Shardus) => {
  const network: NetworkAccount = wrappedStates[tx.network].data
  network.devWindows = tx.devWindows
  network.nextDevWindows = tx.nextDevWindows
  network.developerFund = tx.developerFund
  network.nextDeveloperFund = tx.nextDeveloperFund
  network.devIssue = tx.devIssue
  network.timestamp = tx.timestamp
}

export const keys = (tx: Tx.ApplyDevParameters, result: TransactionKeys) => {
  result.targetKeys = [tx.network]
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
