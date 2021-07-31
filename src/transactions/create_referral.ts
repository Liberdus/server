import Shardus from 'shardus-global-server/src/shardus/shardus-types'
import create from '../accounts'
import * as config from '../config'

export const validate_fields = (tx: Tx.CreateReferral, response: Shardus.IncomingTransactionResult) => {
  if (typeof tx.from !== 'string') {
    response.success = false
    response.reason = '"From" must be a string.'
    throw new Error(response.reason)
  }
  if (typeof tx.network !== 'string') {
    response.success = false
    response.reason = '"Network" must be a string.'
    throw new Error(response.reason)
  }
  if (typeof tx.referralHash !== 'string') {
    response.success = false
    response.reason = 'ReferralHash" must be a string.'
    throw new Error(response.reason)
  }
  return response
}

export const validate = (tx: Tx.CreateReferral, wrappedStates: WrappedStates, response: Shardus.IncomingTransactionResult, dapp: Shardus) => {
  const from: UserAccount = wrappedStates[tx.from] && wrappedStates[tx.from].data
  if (from === undefined || from === null) {
    response.reason = "From account doesn't exist"
    return response
  }
  if (tx.referralHash.length !== 64) {
    response.reason = 'referralHash length needs to be 64 characters long'
    return response
  }
  response.success = true
  response.reason = 'This transaction is valid!'
  return response
}

export const apply = (tx: Tx.CreateReferral, txId: string, wrappedStates: WrappedStates, dapp: Shardus) => {
  const from: UserAccount = wrappedStates[tx.from].data
  const network: NetworkAccount = wrappedStates[tx.network].data
  network.timestamp = tx.timestamp
  from.timestamp = tx.timestamp
  // to.data.transactions.push({ ...tx, txId })
  dapp.log('Applied create_referral tx', network)
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
