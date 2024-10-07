import * as crypto from '@shardus/crypto-utils'
import { Shardus, ShardusTypes } from '@shardus/core'
import create from '../accounts'
import * as config from '../config'
import {Accounts, UserAccount, NetworkAccount, IssueAccount, WrappedStates, ProposalAccount, Tx, TransactionKeys } from '../@types'

export const validate_fields = (tx: Tx.RemoveStakeRequest, response: ShardusTypes.IncomingTransactionResult) => {
  if (typeof tx.from !== 'string') {
    response.success = false
    response.reason = 'tx "from" field must be a string.'
    throw new Error(response.reason)
  }
  if (typeof tx.stake !== 'number') {
    response.success = false
    response.reason = 'tx "stake" field must be a number.'
    throw new Error(response.reason)
  }
  return response
}

export const validate = (tx: Tx.RemoveStakeRequest, wrappedStates: WrappedStates, response: ShardusTypes.IncomingTransactionResult, dapp: Shardus) => {
  const from: Accounts = wrappedStates[tx.from] && wrappedStates[tx.from].data
  const network: NetworkAccount = wrappedStates[config.networkAccount].data
  if (typeof from === 'undefined' || from === null) {
    response.reason = 'from account does not exist'
    return response
  }
  if (tx.sign.owner !== tx.from) {
    response.reason = 'not signed by from account'
    return response
  }
  if (crypto.verifyObj(tx) === false) {
    response.reason = 'incorrect signing'
    return response
  }
  if (from.data.stake < network.current.stakeRequired) {
    response.reason = `From account has insufficient stake ${network.current.stakeRequired}`
    return response
  }
  if (tx.stake > network.current.stakeRequired) {
    response.reason = `Stake amount sent: ${tx.stake} is more than the cost required to operate a node: ${network.current.stakeRequired}`
    return response
  }
  response.success = true
  response.reason = 'This transaction is valid!'
  return response
}

export const apply = (tx: Tx.RemoveStakeRequest, txTimestamp: number, txId: string, wrappedStates: WrappedStates, dapp: Shardus) => {
  const from: UserAccount = wrappedStates[tx.from].data
  const network: NetworkAccount = wrappedStates[config.networkAccount].data
  from.data.remove_stake_request = Date.now()
  dapp.log('Applied remove_stake tx marked as requested', from)
}

export const keys = (tx: Tx.RemoveStakeRequest, result: TransactionKeys) => {
  result.sourceKeys = [tx.from]
  result.targetKeys = [config.networkAccount]
  result.allKeys = [...result.sourceKeys, ...result.targetKeys]
  return result
}

export const createRelevantAccount = (dapp: Shardus, account: UserAccount, accountId: string, tx: Tx.RemoveStakeRequest, accountCreated = false) => {
  if (!account) {
    throw new Error('Account must already exist for the remove_stake_request transaction')
  }
  return dapp.createWrappedResponse(accountId, accountCreated, account.hash, account.timestamp, account)
}
