import * as crypto from '@shardus/crypto-utils'
import { Shardus, ShardusTypes } from '@shardus/core'
import create from '../accounts'
import * as config from '../config'
import {Accounts, UserAccount, NetworkAccount, IssueAccount, WrappedStates, ProposalAccount, Tx, TransactionKeys } from '../@types'

export const validate_fields = (tx: Tx.SnapshotClaim, response: ShardusTypes.IncomingTransactionResult) => {
  if (typeof tx.from !== 'string') {
    response.success = false
    response.reason = 'tx "from" field must be a string.'
    throw new Error(response.reason)
  }
  return response
}

export const validate = (tx: Tx.SnapshotClaim, wrappedStates: WrappedStates, response: ShardusTypes.IncomingTransactionResult, dapp: Shardus) => {
  const from: UserAccount = wrappedStates[tx.from] && wrappedStates[tx.from].data
  const network: NetworkAccount = wrappedStates[config.networkAccount] && wrappedStates[config.networkAccount].data
  if (from === undefined || from === null) {
    response.reason = "from account doesn't exist"
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
  if (from.claimedSnapshot) {
    response.reason = 'Already claimed tokens from the snapshot'
    return response
  }
  if (!network) {
    response.reason = 'Snapshot account does not exist yet, OR wrong snapshot address provided in the "to" field'
    return response
  }
  if (!network.snapshot) {
    response.reason = 'Snapshot hasnt been taken yet'
    return response
  }
  if (!network.snapshot[tx.from]) {
    response.reason = 'Your address did not hold any ULT on the Ethereum blockchain during the snapshot'
    return response
  }
  response.success = true
  response.reason = 'This transaction is valid!'
  return response
}

export const apply = (tx: Tx.SnapshotClaim, txTimestamp: number, txId: string, wrappedStates: WrappedStates, dapp: Shardus) => {
  const from: UserAccount = wrappedStates[tx.from].data
  const network: NetworkAccount = wrappedStates[config.networkAccount].data
  from.data.balance += network.snapshot[tx.from]
  network.snapshot[tx.from] = 0
  // from.data.transactions.push({ ...tx, txId })
  from.claimedSnapshot = true
  from.timestamp = txTimestamp
  network.timestamp = txTimestamp
  dapp.log('Applied snapshot_claim tx', from, network)
}

export const keys = (tx: Tx.SnapshotClaim, result: TransactionKeys) => {
  result.sourceKeys = [tx.from]
  result.targetKeys = [config.networkAccount]
  result.allKeys = [...result.sourceKeys, ...result.targetKeys]
  return result
}

export const createRelevantAccount = (dapp: Shardus, account: UserAccount, accountId: string, tx: Tx.SnapshotClaim, accountCreated = false) => {
  if (!account) {
    throw new Error('Account must already exist for the snapshot_claim transaction')
  }
  return dapp.createWrappedResponse(accountId, accountCreated, account.hash, account.timestamp, account)
}
