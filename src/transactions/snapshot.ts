import * as crypto from 'shardus-crypto-utils'
import Shardus from 'shardus-global-server/src/shardus/shardus-types'
import * as config from '../config'
import create from '../accounts'

export const validate_fields = (tx: Tx.Snapshot, response: Shardus.IncomingTransactionResult) => {
  if (typeof tx.network !== 'string') {
    response.success = false
    response.reason = 'tx "network" field must be a string.'
    throw new Error(response.reason)
  }
  if (tx.network !== config.networkAccount) {
    response.success = false
    response.reason = 'tx "network" field must be ' + config.networkAccount
    throw new Error(response.reason)
  }
  if (typeof tx.from !== 'string') {
    response.success = false
    response.reason = 'tx "from" field must be a string.'
    throw new Error(response.reason)
  }
  if (typeof tx.snapshot !== 'object') {
    response.success = false
    response.reason = 'tx "snapshot" field must be an object.'
    throw new Error(response.reason)
  }
  return response
}

export const validate = (tx: Tx.Snapshot, wrappedStates: WrappedStates, response: Shardus.IncomingTransactionResult, dapp: Shardus) => {
  if (tx.sign.owner !== tx.from) {
    response.reason = 'not signed by from account'
    return response
  }
  if (crypto.verifyObj(tx) === false) {
    response.reason = 'incorrect signing'
    return response
  }
  response.success = true
  response.reason = 'This transaction is valid!'
  return response
}

export const apply = (tx: Tx.Snapshot, txId: string, wrappedStates: WrappedStates, dapp: Shardus) => {
  const network: NetworkAccount = wrappedStates[tx.network].data
  network.snapshot = tx.snapshot
  network.timestamp = tx.timestamp
  dapp.log('Applied snapshot tx', network)
}

export const keys = (tx: Tx.Snapshot, result: TransactionKeys) => {
  result.sourceKeys = [tx.from]
  result.targetKeys = [tx.network]
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