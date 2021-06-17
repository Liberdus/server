import stringify from 'fast-stable-stringify'
import { Shardus, ShardusTypes } from 'shardus-global-server'
import create from '../accounts'
import * as config from '../config'

export const validate_fields = (tx: Tx.ApplyDevPayment, response: ShardusTypes.IncomingTransactionResult) => {
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
  if (!Array.isArray(tx.developerFund)) {
    response.success = false
    response.reason = 'tx "developerFund" field must be an array.'
    throw new Error(response.reason)
  }
  return response
}

export const validate = (tx: Tx.ApplyDevPayment, wrappedStates: WrappedStates, response: ShardusTypes.IncomingTransactionResult, dapp: Shardus) => {
  response.success = true
  response.reason = 'This transaction is valid!'
  return response
}

export const apply = (tx: Tx.ApplyDevPayment, txId: string, wrappedStates: WrappedStates, dapp: Shardus) => {
  const network: NetworkAccount = wrappedStates[tx.network].data
  network.developerFund = tx.developerFund
  network.timestamp = tx.timestamp
  dapp.log(`=== APPLIED DEV_PAYMENT GLOBAL ${stringify(network)} ===`)
}

export const keys = (tx: Tx.ApplyDevPayment, result: TransactionKeys) => {
  result.targetKeys = [tx.network]
  result.allKeys = [...result.sourceKeys, ...result.targetKeys]
  return result
}

export const createRelevantAccount = (dapp: Shardus, account: NodeAccount, accountId: string, tx: Tx.ApplyDevPayment, accountCreated = false) => {
  if (!account) {
    account = create.nodeAccount(accountId)
    accountCreated = true
  }
  return dapp.createWrappedResponse(accountId, accountCreated, account.hash, account.timestamp, account)
}
