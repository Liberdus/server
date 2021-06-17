import { Shardus, ShardusTypes } from 'shardus-global-server'
import create from '../accounts'
import * as config from '../config'

export const validate_fields = (tx: Tx.Create, response: ShardusTypes.IncomingTransactionResult) => {
  if (typeof tx.from !== 'string') {
    response.success = false
    response.reason = '"From" must be a string.'
    throw new Error(response.reason)
  }
  if (typeof tx.to !== 'string') {
    response.success = false
    response.reason = '"To" must be a string.'
    throw new Error(response.reason)
  }
  if (typeof tx.amount !== 'number') {
    response.success = false
    response.reason = '"Amount" must be a number.'
    throw new Error(response.reason)
  }
  return response
}

export const validate = (tx: Tx.Create, wrappedStates: WrappedStates, response: ShardusTypes.IncomingTransactionResult, dapp: Shardus) => {
  const to: Accounts = wrappedStates[tx.to] && wrappedStates[tx.to].data
  if (to === undefined || to === null) {
    response.reason = "target account doesn't exist"
    return response
  }
  if (tx.amount < 1) {
    response.reason = 'create amount needs to be positive (1 or greater)'
    return response
  }
  response.success = true
  response.reason = 'This transaction is valid!'
  return response
}

export const apply = (tx: Tx.Create, txId: string, wrappedStates: WrappedStates, dapp: Shardus) => {
  const to: UserAccount = wrappedStates[tx.to].data
  to.data.balance += tx.amount
  to.timestamp = tx.timestamp
  // to.data.transactions.push({ ...tx, txId })
  dapp.log('Applied create tx', to)
}

export const keys = (tx: Tx.Create, result: TransactionKeys) => {
  result.sourceKeys = [tx.from]
  result.targetKeys = [tx.to]
  result.allKeys = [...result.sourceKeys, ...result.targetKeys]
  return result
}

export const createRelevantAccount = (dapp: Shardus, account: UserAccount, accountId: string, tx: Tx.Create, accountCreated = false) => {
  if (!account) {
    account = create.userAccount(accountId, tx.timestamp)
    accountCreated = true
  }
  return dapp.createWrappedResponse(accountId, accountCreated, account.hash, account.timestamp, account)
}