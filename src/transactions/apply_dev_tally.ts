import stringify from 'fast-stable-stringify'
import { Shardus, ShardusTypes } from '@shardus/core'
import create from '../accounts'
import * as config from '../config'
import _ from 'lodash'

export const validate_fields = (tx: Tx.ApplyDevTally, response: ShardusTypes.IncomingTransactionResult) => {
  if (!Array.isArray(tx.nextDeveloperFund)) {
    response.success = false
    response.reason = 'tx "nextDeveloperFund" field must be an array.'
    throw new Error(response.reason)
  }
  if (_.isEmpty(tx.nextDevWindows)) {
    response.success = false
    response.reason = 'tx "nextDevWindows" field cannot be an empty object.'
    throw new Error(response.reason)
  }
  return response
}

export const validate = (tx: Tx.ApplyDevTally, wrappedStates: WrappedStates, response: ShardusTypes.IncomingTransactionResult, dapp: Shardus) => {
  response.success = true
  response.reason = 'This transaction is valid!'
  return response
}

export const apply = (tx: Tx.ApplyDevTally, txTimestamp: number, txId: string, wrappedStates: WrappedStates, dapp: Shardus) => {
  const network: NetworkAccount = wrappedStates[config.networkAccount].data
  network.nextDeveloperFund = tx.nextDeveloperFund
  network.nextDevWindows = tx.nextDevWindows
  network.timestamp = txTimestamp
  dapp.log(`=== APPLIED DEV_TALLY GLOBAL ${stringify(network)} ===`)
}

export const keys = (tx: Tx.ApplyDevTally, result: TransactionKeys) => {
  result.targetKeys = [config.networkAccount]
  result.allKeys = [...result.sourceKeys, ...result.targetKeys]
  return result
}

export const createRelevantAccount = (dapp: Shardus, account: NodeAccount, accountId: string, tx: Tx.ApplyDevTally, accountCreated = false) => {
  if (!account) {
    account = create.nodeAccount(accountId)
    accountCreated = true
  }
  return dapp.createWrappedResponse(accountId, accountCreated, account.hash, account.timestamp, account)
}
