import { Shardus, ShardusTypes } from '@shardus/core'
import create from '../accounts'
import * as config from '../config'
import * as utils from '../utils'
import { Accounts, UserAccount, NetworkAccount, NodeAccount, WrappedStates, Tx, AppReceiptData } from '../@types'
import * as crypto from '../crypto'
import { SafeBigIntMath } from '../utils/safeBigIntMath'
import * as AccountsStorage from '../storage/accountStorage'
import { getNodeRewardRateWei, getStakeRequiredWei } from '../utils'

export const validate_fields = (tx: Tx.NodeReward, response: ShardusTypes.IncomingTransactionResult): ShardusTypes.IncomingTransactionResult => {
  if (utils.isValidAddress(tx.from) === false) {
    response.reason = 'tx "from" is not a valid address.'
    return response
  }
  if (utils.isValidAddress(tx.nodeId) === false) {
    response.reason = 'tx "nodeId" is not a valid address.'
    return response
  }
  if (utils.isValidAddress(tx.to) === false) {
    response.reason = 'tx "to" is not a valid address.'
    return response
  }
  if (!tx.sign || !tx.sign.owner || !tx.sign.sig || tx.sign.owner !== tx.from) {
    response.reason = 'not signed by from account'
    return response
  }
  // Signed by Node Account
  if (crypto.verifyObj(tx, true) === false) {
    response.reason = 'incorrect signing'
    return response
  }
  response.success = true
  return response
}

export const validate = (
  tx: Tx.NodeReward,
  wrappedStates: WrappedStates,
  response: ShardusTypes.IncomingTransactionResult,
  dapp: Shardus,
): ShardusTypes.IncomingTransactionResult => {
  const from: Accounts = wrappedStates[tx.from] && wrappedStates[tx.from].data
  const network: NetworkAccount = wrappedStates[config.networkAccount].data
  let nodeInfo
  try {
    nodeInfo = dapp.getNode(tx.nodeId)
  } catch (err) {
    dapp.log(err)
  }
  if (!nodeInfo) {
    response.reason = 'no nodeInfo'
    return response
  }
  if (tx.timestamp - nodeInfo.activeTimestamp < network.current.nodeRewardInterval) {
    response.reason = 'Too early for this node to get a reward'
    return response
  }
  if (!from) {
    response.success = true
    response.reason = 'This transaction in valid'
    return response
  }
  if (from) {
    if (!from.nodeRewardTime) {
      response.success = true
      response.reason = 'This transaction in valid'
      return response
    }
    if (tx.timestamp - from.nodeRewardTime < network.current.nodeRewardInterval) {
      response.reason = 'Too early for this node to get paid'
      return response
    }
  }
  response.success = true
  response.reason = 'This transaction is valid!'
  return response
}

export const apply = (
  tx: Tx.NodeReward,
  txTimestamp: number,
  txId: string,
  wrappedStates: WrappedStates,
  dapp: Shardus,
  applyResponse: ShardusTypes.ApplyResponse,
): void => {
  const from: NodeAccount = wrappedStates[tx.from].data
  const to: UserAccount = wrappedStates[tx.to].data
  const network: NetworkAccount = wrappedStates[config.networkAccount].data
  //const nodeAccount: NodeAccount = to
  from.balance = SafeBigIntMath.add(from.balance, getNodeRewardRateWei(AccountsStorage.cachedNetworkAccount))
  dapp.log(`Reward from ${tx.from} to ${tx.to}`)
  if (tx.from !== tx.to) {
    dapp.log('Node reward to and from are different.')
    dapp.log('TO ACCOUNT', to.data)
    if (to.data.stake >= getStakeRequiredWei(AccountsStorage.cachedNetworkAccount)) {
      to.data.balance = SafeBigIntMath.add(to.data.balance, from.balance)
      if (to.data.remove_stake_request) to.data.remove_stake_request = null
      from.balance = BigInt(0)
      to.timestamp = txTimestamp
    }
  }
  from.nodeRewardTime = txTimestamp
  from.timestamp = txTimestamp
  //NodeAccount does not have transactions
  //to.data.transactions.push({ ...tx, txId })

  const appReceiptData: AppReceiptData = {
    txId,
    timestamp: txTimestamp,
    success: true,
    from: tx.from,
    to: tx.to,
    type: tx.type,
    transactionFee: BigInt(0),
  }
  const appReceiptDataHash = crypto.hashObj(appReceiptData)
  dapp.applyResponseAddReceiptData(applyResponse, appReceiptData, appReceiptDataHash)
  dapp.log('Applied node_reward tx', from, to)
}

export const createFailedAppReceiptData = (
  tx: Tx.NodeReward,
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
    to: tx.to,
    type: tx.type,
    transactionFee: BigInt(0),
  }
  const appReceiptDataHash = crypto.hashObj(appReceiptData)
  dapp.applyResponseAddReceiptData(applyResponse, appReceiptData, appReceiptDataHash)
}

export const keys = (tx: Tx.NodeReward, result: ShardusTypes.TransactionKeys): ShardusTypes.TransactionKeys => {
  result.sourceKeys = [tx.from]
  result.targetKeys = [tx.to, config.networkAccount]
  result.allKeys = [...result.sourceKeys, ...result.targetKeys]
  return result
}

export const memoryPattern = (tx: Tx.NodeReward, result: ShardusTypes.TransactionKeys): ShardusTypes.ShardusMemoryPatternsInput => {
  return {
    rw: [tx.from, tx.to],
    wo: [],
    on: [],
    ri: [],
    ro: [config.networkAccount],
  }
}

export const createRelevantAccount = (
  dapp: Shardus,
  account: NodeAccount | UserAccount,
  accountId: string,
  tx: Tx.NodeReward,
  accountCreated = false,
): ShardusTypes.WrappedResponse => {
  if (!account) {
    if (accountId === tx.nodeId) {
      account = create.nodeAccount(accountId)
    } else {
      throw new Error('UserAccount must already exist for the node_reward transaction')
    }
    accountCreated = true
  }
  return dapp.createWrappedResponse(accountId, accountCreated, account.hash, account.timestamp, account)
}
