import * as crypto from 'shardus-crypto-utils'
import Shardus from 'shardus-global-server/src/shardus/shardus-types'
import create from '../accounts'

export const validate_fields = (tx: Tx.Register, response: Shardus.IncomingTransactionResult) => {
  if (typeof tx.aliasHash !== 'string') {
    response.success = false
    response.reason = '"aliasHash" must be a string.'
    throw new Error(response.reason)
  }
  if (typeof tx.from !== 'string') {
    response.success = false
    response.reason = '"From" must be a string.'
    throw new Error(response.reason)
  }
  if (typeof tx.alias !== 'string') {
    response.success = false
    response.reason = '"alias" must be a string.'
    throw new Error(response.reason)
  }
  if (tx.alias.length >= 20) {
    response.success = false
    response.reason = '"alias" must be less than 21 characters (20 max)'
    throw new Error(response.reason)
  }
  if (/[^A-Za-z0-9]+/g.test(tx.alias)) {
    response.success = false
    response.reason = 'Alias may only contain alphanumeric characters'
    throw new Error(response.reason)
  }
  return response
}

export const validate = (tx: Tx.Register, wrappedStates: WrappedStates, response: Shardus.IncomingTransactionResult, dapp: Shardus) => {
  const from: UserAccount = wrappedStates[tx.from] && wrappedStates[tx.from].data
  const alias: AliasAccount = wrappedStates[tx.aliasHash] && wrappedStates[tx.aliasHash].data
  if (tx.sign.owner !== tx.from) {
    response.reason = 'not signed by from account'
    return response
  }
  if (crypto.verifyObj(tx) === false) {
    response.reason = 'incorrect signing'
    return response
  }
  if (!alias) {
    response.reason = 'Alias account was not found for some reason'
    return response
  }
  if (from.alias !== null) {
    response.reason = 'User has already registered an alias'
    return response
  }
  if (alias.inbox === tx.alias) {
    response.reason = 'This alias is already taken'
    return response
  }
  if (/[^A-Za-z0-9]+/g.test(tx.alias)) {
    response.reason = 'Alias may only contain alphanumeric characters'
    return response
  }
  response.success = true
  response.reason = 'This transaction is valid!'
  return response
}

export const apply = (tx: Tx.Register, txId: string, wrappedStates, dapp: Shardus) => {
  const from: UserAccount = wrappedStates[tx.from].data
  const alias: AliasAccount = wrappedStates[tx.aliasHash].data
  // from.data.balance -= network.current.transactionFee
  // from.data.balance -= maintenanceAmount(tx.timestamp, from)
  alias.inbox = tx.alias
  from.alias = tx.alias
  alias.address = tx.from
  // from.data.transactions.push({ ...tx, txId })
  alias.timestamp = tx.timestamp
  from.timestamp = tx.timestamp
  dapp.log('Applied register tx', from, alias)
}

export const keys = (tx: Tx.Register, result: TransactionKeys) => {
  result.sourceKeys = [tx.from]
  result.targetKeys = [tx.aliasHash]
  result.allKeys = [...result.sourceKeys, ...result.targetKeys]
  return result
}

export const createRelevantAccount = (dapp: Shardus, account: UserAccount | AliasAccount, accountId: string, tx: Tx.Register, accountCreated = false) => {
  if (!account) {
    if (accountId === tx.aliasHash) {
      account = create.aliasAccount(accountId)
    } else {
      account = create.userAccount(accountId, tx.timestamp)
    }
    accountCreated = true
  }
  return dapp.createWrappedResponse(accountId, accountCreated, account.hash, account.timestamp, account)
}