import * as crypto from '../crypto'
import { Shardus, ShardusTypes } from '@shardeum-foundation/core'
import create from '../accounts'
import * as config from '../config'
import { Accounts, UserAccount, NetworkAccount, IssueAccount, WrappedStates, ProposalAccount, Tx, TransactionKeys, AppReceiptData } from '../@types'

export const validate_fields = (tx: Tx.RemoveStake, response: ShardusTypes.IncomingTransactionResult) => {
  if (typeof tx.from !== 'string') {
    response.success = false
    response.reason = 'tx "from" field must be a string.'
    throw new Error(response.reason)
  }
  if (typeof tx.stake !== 'bigint') {
    response.success = false
    response.reason = 'tx "stake" field must be a bigint.'
    throw new Error(response.reason)
  }
  return response
}

export const validate = (tx: Tx.RemoveStake, wrappedStates: WrappedStates, response: ShardusTypes.IncomingTransactionResult, dapp: Shardus) => {
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
  if (from.data.stake < network.current.stakeRequiredUsd) {
    response.reason = `From account has insufficient stake ${network.current.stakeRequiredUsd}`
    return response
  }
  if (!from.data.remove_stake_request) {
    response.reason = `Request is not active to remove stake.`
    return response
  }
  if (tx.stake > network.current.stakeRequiredUsd) {
    response.reason = `Stake amount sent: ${tx.stake} is more than the cost required to operate a node: ${network.current.stakeRequiredUsd}`
    return response
  }
  response.success = true
  response.reason = 'This transaction is valid!'
  return response
}

export const apply = (
  tx: Tx.RemoveStake,
  txTimestamp: number,
  txId: string,
  wrappedStates: WrappedStates,
  dapp: Shardus,
  applyResponse: ShardusTypes.ApplyResponse,
): void => {
  const from: UserAccount = wrappedStates[tx.from].data
  const network: NetworkAccount = wrappedStates[config.networkAccount].data
  const shouldRemoveState = from.data.remove_stake_request && from.data.remove_stake_request + 2 * network.current.nodeRewardInterval <= dapp.shardusGetTime()
  const stakeRemovalStatus = shouldRemoveState
    ? 'Applied remove_stake tx'
    : 'Cancelled remove_stake tx because `remove_stake_request` is null or earlier than 2 * nodeRewardInterval'
  if (shouldRemoveState) {
    from.data.balance += network.current.stakeRequiredUsd
    from.data.stake = BigInt(0)
    from.timestamp = txTimestamp
    from.data.remove_stake_request = null
    // from.data.transactions.push({ ...tx, txId })
    dapp.log('Applied remove_stake tx', from)
  } else {
    dapp.log(stakeRemovalStatus, from)
  }

  const appReceiptData: AppReceiptData = {
    txId,
    timestamp: txTimestamp,
    success: true,
    from: tx.from,
    to: tx.from,
    type: tx.type,
    transactionFee: BigInt(0),
    additionalInfo: {
      stakeRemovalStatus,
    },
  }
  const appReceiptDataHash = crypto.hashObj(appReceiptData)
  dapp.applyResponseAddReceiptData(applyResponse, appReceiptData, appReceiptDataHash)
  dapp.log('Applied remove_stake tx marked as requested', from)
}

export const keys = (tx: Tx.RemoveStake, result: TransactionKeys) => {
  result.sourceKeys = [tx.from]
  result.targetKeys = [config.networkAccount]
  result.allKeys = [...result.sourceKeys, ...result.targetKeys]
  return result
}

export const memoryPattern = (tx: Tx.RemoveStake, result: TransactionKeys): ShardusTypes.ShardusMemoryPatternsInput => {
  return {
    rw: [tx.from],
    wo: [],
    on: [],
    ri: [],
    ro: [config.networkAccount],
  }
}

export const createRelevantAccount = (dapp: Shardus, account: UserAccount, accountId: string, tx: Tx.RemoveStake, accountCreated = false) => {
  if (!account) {
    throw new Error('Account must already exist for the remove_stake transaction')
  }
  return dapp.createWrappedResponse(accountId, accountCreated, account.hash, account.timestamp, account)
}
