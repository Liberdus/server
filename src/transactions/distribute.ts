import * as crypto from 'shardus-crypto-utils'
import Shardus from 'shardus-global-server/src/shardus/shardus-types'
import * as utils from '../utils'
import create from '../accounts'

export const validate_fields = (tx: Tx.Distribute, response: Shardus.IncomingTransactionResult) => {
  if (typeof tx.from !== 'string') {
    response.success = false
    response.reason = '"From" must be a string.'
    throw new Error(response.reason)
  }
  if (Array.isArray(tx.recipients) !== true) {
    response.success = false
    response.reason = '"Recipients" must be an array.'
    throw new Error(response.reason)
  }
  if (typeof tx.amount !== 'number') {
    response.success = false
    response.reason = '"Amount" must be a number.'
    throw new Error(response.reason)
  }
  if (tx.amount <= 0) {
    response.success = false
    response.reason = '"Amount" must be a positive number.'
    throw new Error(response.reason)
  }
  return response
}

export const validate = (tx: Tx.Distribute, wrappedStates: WrappedStates, response: Shardus.IncomingTransactionResult, dapp: Shardus) => {
  const from: Accounts = wrappedStates[tx.from] && wrappedStates[tx.from].data
  const network: NetworkAccount = wrappedStates[tx.network].data
  const recipients: UserAccount[] = tx.recipients.map((id: string) => wrappedStates[id].data)
  if (tx.sign.owner !== tx.from) {
    response.reason = 'not signed by from account'
    return response
  }
  if (crypto.verifyObj(tx) === false) {
    response.reason = 'incorrect signing'
    return response
  }
  if (from === undefined || from === null) {
    response.reason = "from account doesn't exist"
    return response
  }
  for (const user of recipients) {
    if (!user) {
      response.reason = 'no account for one of the recipients'
      return response
    }
  }
  if (from.data.balance < recipients.length * tx.amount + network.current.transactionFee) {
    response.reason = "from account doesn't have sufficient balance to cover the transaction"
    return response
  }
  response.success = true
  response.reason = 'This transaction is valid!'
  return response
}

export const apply = (tx: Tx.Distribute, txId: string, wrappedStates: WrappedStates, dapp: Shardus) => {
  const from: UserAccount = wrappedStates[tx.from].data
  const network: NetworkAccount = wrappedStates[tx.network].data
  const recipients: UserAccount[] = tx.recipients.map((id: string) => wrappedStates[id].data)
  from.data.balance -= network.current.transactionFee
  from.data.transactions.push({ ...tx, txId })
  for (const user of recipients) {
    from.data.balance -= tx.amount
    user.data.balance += tx.amount
    user.data.transactions.push({ ...tx, txId })
  }
  from.data.balance -= utils.maintenanceAmount(tx.timestamp, from, network)
  dapp.log('Applied distribute transaction', from, recipients)
}

export const keys = (tx: Tx.Distribute, result: TransactionKeys) => {
  result.sourceKeys = [tx.from]
  result.targetKeys = [...tx.recipients, tx.network]
  result.allKeys = [...result.sourceKeys, ...result.targetKeys]
  return result
}

export const createRelevantAccount = (dapp: Shardus, account: UserAccount, accountId: string, tx: Tx.Distribute, accountCreated = false) => {
  if (!account) {
    account = create.userAccount(accountId, tx.timestamp)
    accountCreated = true
  }
  return dapp.createWrappedResponse(accountId, accountCreated, account.hash, account.timestamp, account)
}