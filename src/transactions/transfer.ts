import * as crypto from '../crypto'
import { Shardus, ShardusTypes } from '@shardus/core'
import * as utils from '../utils'
import * as config from '../config'
import {Accounts, UserAccount, NetworkAccount, IssueAccount, WrappedStates, ProposalAccount, Tx, TransactionKeys } from '../@types'
import { toShardusAddress } from '../utils/address'

export const validate_fields = (tx: Tx.Transfer, response: ShardusTypes.IncomingTransactionResult) => {
  if (typeof tx.from !== 'string') {
    response.success = false
    response.reason = 'tx "from" field must be a string.'
    throw new Error(response.reason)
  }
  if (typeof tx.to !== 'string') {
    response.success = false
    response.reason = 'tx "to" field must be a string.'
    throw new Error(response.reason)
  }
  if (typeof tx.amount !== 'bigint' || tx.amount <= BigInt(0)) {
    response.success = false
    response.reason = 'tx "amount" field must be a bigint and greater than 0.'
    throw new Error(response.reason)
  }
  return response
}

export const validate = (tx: Tx.Transfer, wrappedStates: WrappedStates, response: ShardusTypes.IncomingTransactionResult, dapp: Shardus) => {
  let clonedTx = { ...tx }
  if (config.LiberdusFlags.useEthereumAddress) {
    clonedTx.from = toShardusAddress(tx.from)
    clonedTx.to = toShardusAddress(tx.to)
  }
  const from: Accounts = wrappedStates[clonedTx.from] && wrappedStates[clonedTx.from].data
  const to: Accounts = wrappedStates[clonedTx.to] && wrappedStates[clonedTx.to].data
  const network: NetworkAccount = wrappedStates[config.networkAccount].data
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
  if (to === undefined || to === null) {
    response.reason = "To account doesn't exist"
    return response
  }

  if (from.data.balance < tx.amount + network.current.transactionFee) {
    response.reason = "from account doesn't have sufficient balance to cover the transaction"
    return response
  }
  response.success = true
  response.reason = 'This transaction is valid!'
  return response
}

export const apply = (tx: Tx.Transfer, txTimestamp: number, txId: string, wrappedStates: WrappedStates, dapp: Shardus) => {
  const from = wrappedStates[tx.from].data
  const to: UserAccount = wrappedStates[tx.to].data
  const network: NetworkAccount = wrappedStates[config.networkAccount].data
  from.data.balance -= tx.amount + network.current.transactionFee
  from.data.balance -= utils.maintenanceAmount(txTimestamp, from, network)
  to.data.balance += tx.amount
  // from.data.transactions.push({ ...tx, txId })
  // to.data.transactions.push({ ...tx, txId })
  from.timestamp = txTimestamp
  to.timestamp = txTimestamp
  dapp.log('Applied transfer tx', from, to)
}

export const keys = (tx: Tx.Transfer, result: TransactionKeys) => {
  result.sourceKeys = [tx.from]
  result.targetKeys = [tx.to, config.networkAccount]
  result.allKeys = [...result.sourceKeys, ...result.targetKeys]
  return result
}

export const createRelevantAccount = (dapp: Shardus, account: UserAccount, accountId: string, tx: Tx.Transfer, accountCreated = false) => {
  if (!account) {
    throw Error('Account must exist in order to send a transfer transaction')
  }
  return dapp.createWrappedResponse(accountId, accountCreated, account.hash, account.timestamp, account)
}
