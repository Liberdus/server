import stringify from 'fast-stable-stringify'
import _ from 'lodash'
import { Shardus, ShardusTypes } from 'shardus-global-server'
import create from '../accounts'
import * as config from '../config'

export const validate_fields = (tx: Tx.ApplyChangeConfig, response: ShardusTypes.IncomingTransactionResult) => {
  return response
}

export const validate = (tx: Tx.ApplyChangeConfig, wrappedStates: WrappedStates, response: ShardusTypes.IncomingTransactionResult, dapp: Shardus) => {
  response.success = true
  response.reason = 'This transaction is valid!'
  return response
}

export const apply = (tx: Tx.ApplyChangeConfig, txId: string, wrappedStates: WrappedStates, dapp: Shardus) => {
  const network: NetworkAccount = wrappedStates[config.networkAccount].data
  network.listOfChanges.push(tx.change)
  network.timestamp = tx.timestamp
  dapp.log(`=== APPLIED CHANGE_CONFIG GLOBAL ${stringify(network)} ===`)
}

export const keys = (tx: Tx.ApplyChangeConfig, result: TransactionKeys) => {
  result.targetKeys = [config.networkAccount]
  result.allKeys = [...result.sourceKeys, ...result.targetKeys]
  return result
}

export const createRelevantAccount = (dapp: Shardus, account: NodeAccount, accountId: string, tx: Tx.ApplyChangeConfig, accountCreated = false) => {
  if (!account) {
    account = create.nodeAccount(accountId)
    accountCreated = true
  }
  return dapp.createWrappedResponse(accountId, accountCreated, account.hash, account.timestamp, account)
}