import stringify from 'fast-stable-stringify'
import { Shardus, ShardusTypes } from '@shardus/core'
import create from '../accounts'
import * as config from '../config'
import {Accounts, UserAccount, NetworkAccount, IssueAccount, WrappedStates, ProposalAccount, Tx, TransactionKeys } from '../@types'

export const validate_fields = (tx: Tx.ApplyDevPayment, response: ShardusTypes.IncomingTransactionResult) => {
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

export const apply = (tx: Tx.ApplyDevPayment, txTimestamp: number, txId: string, wrappedStates: WrappedStates, dapp: Shardus) => {
  const network: NetworkAccount = wrappedStates[config.networkAccount].data
  network.developerFund = tx.developerFund
  network.timestamp = txTimestamp
  dapp.log(`=== APPLIED DEV_PAYMENT GLOBAL ${stringify(network)} ===`)
}

export const keys = (tx: Tx.ApplyDevPayment, result: TransactionKeys) => {
  result.targetKeys = [config.networkAccount]
  result.allKeys = [...result.sourceKeys, ...result.targetKeys]
  return result
}

export const createRelevantAccount = (dapp: Shardus, account: NetworkAccount, accountId: string, tx: Tx.ApplyDevPayment, accountCreated = false) => {
  if (!account) {
    throw new Error('Network Account must already exist for the apply_developer_payment transaction')
  }
  return dapp.createWrappedResponse(accountId, accountCreated, account.hash, account.timestamp, account)
}
