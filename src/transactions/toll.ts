import * as crypto from 'shardus-crypto-utils'
import { Shardus, ShardusTypes } from 'shardus-global-server'
import * as utils from '../utils'
import create from '../accounts'
import * as config from '../config'

export const validate_fields = (tx: Tx.Toll, response: ShardusTypes.IncomingTransactionResult) => {
  if (typeof tx.from !== 'string') {
    response.success = false
    response.reason = 'tx "from" field must be a string.'
    throw new Error(response.reason)
  }
  if (typeof tx.toll !== 'number') {
    response.success = false
    response.reason = 'tx "toll" field must be a number.'
    throw new Error(response.reason)
  }
  if (tx.toll < 1) {
    response.success = false
    response.reason = 'Minimum "toll" allowed is 1 token'
    throw new Error(response.reason)
  }
  if (tx.toll > 1000000) {
    response.success = false
    response.reason = 'Maximum toll allowed is 1,000,000 tokens.'
    throw new Error(response.reason)
  }
  return response
}

export const validate = (tx: Tx.Toll, wrappedStates: WrappedStates, response: ShardusTypes.IncomingTransactionResult, dapp: Shardus) => {
  const from: Accounts = wrappedStates[tx.from] && wrappedStates[tx.from].data
  const network: NetworkAccount = wrappedStates[config.networkAccount].data
  if (tx.sign.owner !== tx.from) {
    response.reason = 'not signed by from account'
    return response
  }
  if (crypto.verifyObj(tx) === false) {
    response.reason = 'incorrect signing'
    return response
  }
  if (!from) {
    response.reason = 'from account does not exist'
    return response
  }
  if (from.data.balance < network.current.transactionFee) {
    response.reason = 'from account does not have sufficient funds to complete toll transaction'
    return response
  }
  if (!tx.toll) {
    response.reason = 'Toll was not defined in the transaction'
    return response
  }
  if (tx.toll < 1) {
    response.reason = 'Toll must be greater than or equal to 1'
    return response
  }
  response.success = true
  response.reason = 'This transaction is valid!'
  return response
}

export const apply = (tx: Tx.Toll, txId: string, wrappedStates: WrappedStates, dapp: Shardus) => {
  const from: UserAccount = wrappedStates[tx.from].data
  const network: NetworkAccount = wrappedStates[config.networkAccount].data
  from.data.balance -= network.current.transactionFee
  from.data.balance -= utils.maintenanceAmount(tx.timestamp, from, network)
  from.data.toll = tx.toll
  // from.data.transactions.push({ ...tx, txId })
  from.timestamp = tx.timestamp
  dapp.log('Applied toll tx', from)
}

export const keys = (tx: Tx.Toll, result: TransactionKeys) => {
  result.sourceKeys = [tx.from]
  result.targetKeys = [config.networkAccount]
  result.allKeys = [...result.sourceKeys, ...result.targetKeys]
  return result
}

export const createRelevantAccount = (dapp: Shardus, account: UserAccount, accountId: string, tx: Tx.RemoveStake, accountCreated = false) => {
  if (!account) {
    account = create.userAccount(accountId, tx.timestamp)
    accountCreated = true
  }
  return dapp.createWrappedResponse(accountId, accountCreated, account.hash, account.timestamp, account)
}