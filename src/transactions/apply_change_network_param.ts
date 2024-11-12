import { Utils } from '@shardus/types'
import _ from 'lodash'
import { Shardus, ShardusTypes } from '@shardus/core'
import create from '../accounts'
import * as config from '../config'
import {NetworkAccount, NodeAccount, WrappedStates, Tx, TransactionKeys } from '../@types'

export const validate_fields = (tx: Tx.ApplyChangeNetworkParam, response: ShardusTypes.IncomingTransactionResult) => {
  return response
}

export const validate = (tx: Tx.ApplyChangeNetworkParam, wrappedStates: WrappedStates, response: ShardusTypes.IncomingTransactionResult, dapp: Shardus) => {
  response.success = true
  response.reason = 'This transaction is valid!'
  return response
}

export const apply = (tx: Tx.ApplyChangeNetworkParam, txTimestamp: number, txId: string, wrappedStates: WrappedStates, dapp: Shardus) => {
  const network: NetworkAccount = wrappedStates[config.networkAccount].data
  network.listOfChanges.push(tx.change)
  network.timestamp = txTimestamp
  dapp.log(`=== APPLIED CHANGE_NETWORK_PARAM GLOBAL ${Utils.safeStringify(network)} ===`)
}

export const keys = (tx: Tx.ApplyChangeNetworkParam, result: TransactionKeys) => {
  result.targetKeys = [config.networkAccount]
  result.allKeys = [...result.sourceKeys, ...result.targetKeys]
  return result
}

export const createRelevantAccount = (dapp: Shardus, account: NodeAccount, accountId: string, tx: Tx.ApplyChangeNetworkParam, accountCreated = false) => {
  if (!account) {
    throw Error('Account must exist in order to perform a apply_change_network_param transaction')
  }
  return dapp.createWrappedResponse(accountId, accountCreated, account.hash, account.timestamp, account)
}
