import * as crypto from 'shardus-crypto-utils'
import Shardus from 'shardus-global-server/src/shardus/shardus-types'
import create from '../accounts'

export const validate_fields = (tx: Tx.Verify, response: Shardus.IncomingTransactionResult) => {
  if (typeof tx.from !== 'string') {
    response.success = false
    response.reason = '"From" must be a string.'
    throw new Error(response.reason)
  }
  if (typeof tx.code !== 'string') {
    response.success = false
    response.reason = '"Code" must be a string.'
    throw new Error(response.reason)
  }
  if (tx.code.length !== 6) {
    response.success = false
    response.reason = '"Code" length must be 6 digits.'
    throw new Error(response.reason)
  }
  if (typeof parseInt(tx.code) !== 'number') {
    response.success = false
    response.reason = '"Code" must be parseable to an integer.'
    throw new Error(response.reason)
  }
  return response
}

export const validate = (tx: Tx.Verify, wrappedStates: WrappedStates, response: Shardus.IncomingTransactionResult, dapp: Shardus) => {
  const from: Accounts = wrappedStates[tx.from] && wrappedStates[tx.from].data
  if (tx.sign.owner !== tx.from) {
    response.reason = 'not signed by from account'
    return response
  }
  if (crypto.verifyObj(tx) === false) {
    response.reason = 'incorrect signing'
    return response
  }
  if (typeof from.verified !== 'string') {
    response.reason = 'From account has not been sent a verification email'
    return response
  }
  if (typeof from.verified === 'boolean') {
    response.reason = 'From account has already been verified'
    return response
  }
  if (crypto.hash(tx.code) !== from.verified) {
    response.reason = 'Hash of code in tx does not match the hash of the verification code sent'
    return response
  }
  response.success = true
  response.reason = 'This transaction is valid!'
  return response
}

export const apply = (tx: Tx.Verify, txId: string, wrappedStates: WrappedStates, dapp: Shardus) => {
  const from: UserAccount = wrappedStates[tx.from].data
  const network: NetworkAccount = wrappedStates[tx.network].data
  from.verified = true
  from.data.balance += network.current.faucetAmount
  from.timestamp = tx.timestamp
  dapp.log('Applied verify tx', from)
}

export const keys = (tx: Tx.Verify, result: TransactionKeys) => {
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