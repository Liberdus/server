import * as crypto from '../crypto'
import { Shardus, ShardusTypes } from '@shardeum-foundation/core'
import * as config from '../config'
import * as utils from '../utils'
import { Accounts, UserAccount, NetworkAccount, WrappedStates, Tx, AppReceiptData } from '../@types'
import { SafeBigIntMath } from '../utils/safeBigIntMath'
import * as AccountsStorage from '../storage/accountStorage'
import { getStakeRequiredWei } from '../utils'

export const validate_fields = (tx: Tx.RemoveStake, response: ShardusTypes.IncomingTransactionResult): ShardusTypes.IncomingTransactionResult => {
  if (utils.isValidAddress(tx.from) === false) {
    response.reason = 'tx "from" is not a valid address.'
    return response
  }
  if (typeof tx.stake !== 'bigint') {
    response.reason = 'tx "stake" field must be a bigint.'
    return response
  }
  if (!tx.sign || !tx.sign.owner || !tx.sign.sig || tx.sign.owner !== tx.from) {
    response.reason = 'not signed by from account'
    return response
  }
  if (crypto.verifyObj(tx) === false) {
    response.reason = 'incorrect signing'
    return response
  }
  response.success = true
  return response
}

export const validate = (
  tx: Tx.RemoveStake,
  wrappedStates: WrappedStates,
  response: ShardusTypes.IncomingTransactionResult,
  dapp: Shardus,
): ShardusTypes.IncomingTransactionResult => {
  const from: Accounts = wrappedStates[tx.from] && wrappedStates[tx.from].data
  const network: NetworkAccount = wrappedStates[config.networkAccount].data
  if (typeof from === 'undefined' || from === null) {
    response.reason = 'from account does not exist'
    return response
  }
  if (from.data.stake < getStakeRequiredWei(AccountsStorage.cachedNetworkAccount)) {
    response.reason = `From account has insufficient stake ${getStakeRequiredWei(AccountsStorage.cachedNetworkAccount)}`
    return response
  }
  if (!from.data.remove_stake_request) {
    response.reason = `Request is not active to remove stake.`
    return response
  }
  if (tx.stake > getStakeRequiredWei(AccountsStorage.cachedNetworkAccount)) {
    response.reason = `Stake amount sent: ${tx.stake} is more than the cost required to operate a node: ${getStakeRequiredWei(
      AccountsStorage.cachedNetworkAccount,
    )}`
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
    from.data.balance = SafeBigIntMath.add(from.data.balance, getStakeRequiredWei(AccountsStorage.cachedNetworkAccount))
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

export const createFailedAppReceiptData = (
  tx: Tx.RemoveStake,
  txTimestamp: number,
  txId: string,
  wrappedStates: WrappedStates,
  dapp: Shardus,
  applyResponse: ShardusTypes.ApplyResponse,
  reason: string,
): void => {
  const appReceiptData: AppReceiptData = {
    txId,
    timestamp: txTimestamp,
    success: false,
    reason,
    from: tx.from,
    to: tx.from,
    type: tx.type,
    transactionFee: BigInt(0),
  }
  const appReceiptDataHash = crypto.hashObj(appReceiptData)
  dapp.applyResponseAddReceiptData(applyResponse, appReceiptData, appReceiptDataHash)
}

export const keys = (tx: Tx.RemoveStake, result: ShardusTypes.TransactionKeys): ShardusTypes.TransactionKeys => {
  result.sourceKeys = [tx.from]
  result.targetKeys = [config.networkAccount]
  result.allKeys = [...result.sourceKeys, ...result.targetKeys]
  return result
}

export const memoryPattern = (tx: Tx.RemoveStake, result: ShardusTypes.TransactionKeys): ShardusTypes.ShardusMemoryPatternsInput => {
  return {
    rw: [tx.from],
    wo: [],
    on: [],
    ri: [],
    ro: [config.networkAccount],
  }
}

export const createRelevantAccount = (
  dapp: Shardus,
  account: UserAccount,
  accountId: string,
  tx: Tx.RemoveStake,
  accountCreated = false,
): ShardusTypes.WrappedResponse => {
  if (!account) {
    throw new Error('Account must already exist for the remove_stake transaction')
  }
  return dapp.createWrappedResponse(accountId, accountCreated, account.hash, account.timestamp, account)
}
