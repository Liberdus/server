import * as crypto from '../../crypto'
import { Shardus, ShardusTypes } from '@shardeum-foundation/core'
import * as utils from './../../utils'
import { LiberdusFlags } from './../../config'
import * as AccountsStorage from '../../storage/accountStorage'
import { UserAccount, WrappedStates, Tx, NodeAccount, AppReceiptData } from './../../@types'
import { SafeBigIntMath } from '../../utils/safeBigIntMath'

export const validate_fields = (tx: Tx.WithdrawStake, response: ShardusTypes.IncomingTransactionResult): ShardusTypes.IncomingTransactionResult => {
  if (utils.isValidAddress(tx.nominator) === false) {
    response.reason = 'tx "nominator" field must be a string and valid address.'
    return response
  }
  if (utils.isValidAddress(tx.nominee) === false) {
    response.reason = 'tx "nominee" field must be a string and valid address.'
    return response
  }
  if (typeof tx.force !== 'boolean') {
    response.reason = 'tx "force" field must be a boolean.'
    return response
  }
  if (!tx.sign || !tx.sign.owner || !tx.sign.sig || tx.sign.owner !== tx.nominator) {
    response.reason = 'not signed by nominator account'
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
  tx: Tx.WithdrawStake,
  wrappedStates: WrappedStates,
  response: ShardusTypes.IncomingTransactionResult,
  dapp: Shardus,
): ShardusTypes.IncomingTransactionResult => {
  const nominatorAccount: UserAccount = wrappedStates[tx.nominator] && wrappedStates[tx.nominator].data
  const nodeAccount: NodeAccount = wrappedStates[tx.nominee] && wrappedStates[tx.nominee].data
  if (typeof nominatorAccount === 'undefined' || nominatorAccount === null) {
    response.reason = 'nominator account does not exist'
    return response
  }
  if (typeof nodeAccount === 'undefined' || nodeAccount === null) {
    response.reason = 'nominee account does not exist'
    return response
  }
  if (nominatorAccount.operatorAccountInfo === undefined || nominatorAccount.operatorAccountInfo === null) {
    response.reason = 'nominator account does not have operator account info'
    return response
  }
  if (nominatorAccount.operatorAccountInfo.nominee === '') {
    response.reason = 'nominator account has not staked to any node yet'
    return response
  }
  if (nominatorAccount.operatorAccountInfo.nominee !== tx.nominee) {
    response.reason = 'nominator account has already staked to a different node'
    return response
  }
  if (nodeAccount.nominator == null || nodeAccount.nominator === '') {
    response.reason = 'No one has staked to this node yet'
    return response
  }
  if (nodeAccount.nominator !== tx.nominator) {
    response.reason = 'Node account has already been staked to another nominator'
    return response
  }
  if (nodeAccount.stakeLock === BigInt(0)) {
    response.reason = 'Node account has zero stake'
    return response
  }
  const { unlocked, reason } = isStakeUnlocked(nominatorAccount, nodeAccount, dapp)
  if (!unlocked) {
    response.reason = reason
    return response
  }
  if (nodeAccount.rewardEndTime === 0 && nodeAccount.rewardStartTime > 0 && !(tx.force && LiberdusFlags.allowForceUnstake)) {
    response.reason = `No reward endTime set, can't unstake node yet`
    return response
  }
  response.success = true
  response.reason = 'This transaction is valid!'
  return response
}

export const apply = (
  tx: Tx.WithdrawStake,
  txTimestamp: number,
  txId: string,
  wrappedStates: WrappedStates,
  dapp: Shardus,
  applyResponse: ShardusTypes.ApplyResponse,
): void => {
  const nominatorAccount: UserAccount = wrappedStates[tx.nominator].data
  const nodeAccount: NodeAccount = wrappedStates[tx.nominee] && wrappedStates[tx.nominee].data

  const currentBalance = nominatorAccount.data.balance
  const stake = nodeAccount.stakeLock
  let reward = nodeAccount.reward
  if (nodeAccount.rewardEndTime === 0 && nodeAccount.rewardStartTime > 0) {
    // This block will only be reached if the node is inactive and the force unstake flag has been set
    reward = BigInt(0)
  }
  const penalty = nodeAccount.penalty
  let txFee
  if (utils.isEqualOrNewerVersion('2.4.3', AccountsStorage.cachedNetworkAccount.current.activeVersion)) {
    txFee = utils.getTransactionFeeWei(AccountsStorage.cachedNetworkAccount)
  } else if (utils.isEqualOrNewerVersion('2.4.0', AccountsStorage.cachedNetworkAccount.current.activeVersion)) {
    txFee = AccountsStorage.cachedNetworkAccount.current.transactionFee
  } else {
    const txFeeUsd = AccountsStorage.cachedNetworkAccount.current.transactionFee
    txFee = utils.scaleByStabilityFactor(txFeeUsd, AccountsStorage.cachedNetworkAccount)
  } // [TODO] check if the maintainance fee is also needed in withdraw_stake tx
  const maintenanceFee = utils.maintenanceAmount(txTimestamp, nominatorAccount, AccountsStorage.cachedNetworkAccount)
  console.log('currentBalance', currentBalance, 'stake', stake, 'reward', reward, 'txFee', txFee, 'maintenanceFee', maintenanceFee)
  let newBalance = SafeBigIntMath.add(currentBalance, stake)
  newBalance = SafeBigIntMath.add(newBalance, reward)
  newBalance = SafeBigIntMath.subtract(newBalance, txFee)
  newBalance = SafeBigIntMath.subtract(newBalance, maintenanceFee)
  console.log('newBalance', newBalance)
  nominatorAccount.data.balance = newBalance
  nominatorAccount.operatorAccountInfo.stake = BigInt(0)
  nominatorAccount.operatorAccountInfo.nominee = ''
  nominatorAccount.operatorAccountInfo.certExp = 0

  // update the operator historical stats
  nominatorAccount.operatorAccountInfo.operatorStats.totalUnstakeReward = SafeBigIntMath.add(
    nominatorAccount.operatorAccountInfo.operatorStats.totalUnstakeReward,
    reward,
  )
  nominatorAccount.operatorAccountInfo.operatorStats.unstakeCount += 1
  nominatorAccount.operatorAccountInfo.operatorStats.lastStakedNodeKey = tx.nominee

  nodeAccount.nominator = ''
  nodeAccount.stakeLock = BigInt(0)
  nodeAccount.penalty = BigInt(0)
  nodeAccount.reward = BigInt(0)
  nodeAccount.rewardStartTime = 0
  nodeAccount.rewardEndTime = 0
  nodeAccount.rewarded = false

  nominatorAccount.timestamp = txTimestamp
  nodeAccount.timestamp = txTimestamp
  // nominator.data.transactions.push({ ...tx, txId })

  const appReceiptData: AppReceiptData = {
    txId,
    timestamp: txTimestamp,
    success: true,
    from: tx.nominator,
    to: tx.nominee,
    type: tx.type,
    transactionFee: txFee,
    additionalInfo: {
      maintenanceFee,
      stake,
      reward,
      penalty,
      totalUnstakeAmount: stake + reward - penalty,
    },
  }

  if (LiberdusFlags.versionFlags.stakingAppReceiptUpdate === false) {
    if ('penalty' in appReceiptData.additionalInfo) delete appReceiptData.additionalInfo.penalty
    if ('totalUnstakeAmount' in appReceiptData.additionalInfo) appReceiptData.additionalInfo.totalUnstakeAmount = stake + reward
  }

  const appReceiptDataHash = crypto.hashObj(appReceiptData)
  dapp.applyResponseAddReceiptData(applyResponse, appReceiptData, appReceiptDataHash)
  dapp.log('Applied withdraw_stake tx', nominatorAccount, nodeAccount)
}

export const createFailedAppReceiptData = (
  tx: Tx.WithdrawStake,
  txTimestamp: number,
  txId: string,
  wrappedStates: WrappedStates,
  dapp: Shardus,
  applyResponse: ShardusTypes.ApplyResponse,
  reason: string,
): void => {
  // Deduct transaction fee from the sender's balance
  const from: UserAccount = wrappedStates[tx.nominator].data
  let transactionFee = BigInt(0)
  if (from !== undefined && from !== null) {
    const txFeeUsd = AccountsStorage.cachedNetworkAccount.current.transactionFee
    let txFee = utils.scaleByStabilityFactor(txFeeUsd, AccountsStorage.cachedNetworkAccount)

    if (utils.isEqualOrNewerVersion('2.4.0', AccountsStorage.cachedNetworkAccount.current.activeVersion)) {
      txFee = AccountsStorage.cachedNetworkAccount.current.transactionFee
    }

    if (from.data.balance >= txFee) {
      transactionFee = txFee
      from.data.balance = SafeBigIntMath.subtract(from.data.balance, transactionFee)
    } else {
      transactionFee = from.data.balance
      from.data.balance = BigInt(0)
    }
    from.timestamp = txTimestamp
  }
  const appReceiptData: AppReceiptData = {
    txId,
    timestamp: txTimestamp,
    success: false,
    reason,
    from: tx.nominator,
    to: tx.nominee,
    type: tx.type,
    transactionFee,
  }
  const appReceiptDataHash = crypto.hashObj(appReceiptData)
  dapp.applyResponseAddReceiptData(applyResponse, appReceiptData, appReceiptDataHash)
}

export const keys = (tx: Tx.WithdrawStake, result: ShardusTypes.TransactionKeys): ShardusTypes.TransactionKeys => {
  result.sourceKeys = [tx.nominator]
  result.targetKeys = [tx.nominee]
  result.allKeys = [...result.sourceKeys, ...result.targetKeys]
  return result
}

export const memoryPattern = (tx: Tx.WithdrawStake, result: ShardusTypes.TransactionKeys): ShardusTypes.ShardusMemoryPatternsInput => {
  return {
    rw: [tx.nominee, tx.nominator],
    wo: [],
    on: [],
    ri: [],
    ro: [],
  }
}
export const createRelevantAccount = (
  dapp: Shardus,
  account: UserAccount,
  accountId: string,
  tx: Tx.WithdrawStake,
  accountCreated = false,
): ShardusTypes.WrappedResponse => {
  if (!account) {
    throw new Error('Account must already exist in order to perform the withdraw_stake transaction')
  }
  return dapp.createWrappedResponse(accountId, accountCreated, account.hash, account.timestamp, account)
}

export function isStakeUnlocked(
  nominatorAccount: UserAccount,
  nomineeAccount: NodeAccount,
  shardus: Shardus,
): { unlocked: boolean; reason: string; remainingTime: number } {
  if (shardus.isOnStandbyList(nomineeAccount.id) === true) {
    return {
      unlocked: false,
      reason: "This node is in the network's Standby list. Stake is locked until the node leaves the Standby list!",
      remainingTime: -1,
    }
  } else if (shardus.isNodeActiveByPubKey(nomineeAccount.id) === true) {
    return {
      unlocked: false,
      reason: 'This node is still active in the network. Stake is locked until the node leaves the network!',
      remainingTime: -1,
    }
  } else if (shardus.isNodeSelectedByPubKey(nomineeAccount.id)) {
    return {
      unlocked: false,
      reason: 'This node is still selected in the network. Stake is locked until the node leaves the network!',
      remainingTime: -1,
    }
  } else if (shardus.isNodeReadyByPubKey(nomineeAccount.id)) {
    return {
      unlocked: false,
      reason: 'This node is still in ready state in the network. Stake is locked until the node leaves the network!',
      remainingTime: -1,
    }
  } else if (shardus.isNodeSyncingByPubKey(nomineeAccount.id)) {
    return {
      unlocked: false,
      reason: 'This node is still syncing in the network. Stake is locked until the node leaves the network!',
      remainingTime: -1,
    }
  }

  const currentTime = shardus.shardusGetTime()
  if (nominatorAccount.operatorAccountInfo.certExp && nominatorAccount.operatorAccountInfo.certExp > currentTime) {
    const remainingMinutes = Math.ceil((nominatorAccount.operatorAccountInfo.certExp - currentTime) / 60000)
    return {
      unlocked: false,
      reason: `Your node is currently registered in the network with an active certificate. Deregistration will be completed in ${remainingMinutes} minute${
        remainingMinutes === 1 ? '' : 's'
      }. You'll be able to unstake once this completed.`,
      remainingTime: nominatorAccount.operatorAccountInfo.certExp - currentTime,
    }
  }

  const stakeLockTime = AccountsStorage.cachedNetworkAccount.current.stakeLockTime

  if (utils.isEqualOrNewerVersion('2.3.9', AccountsStorage.cachedNetworkAccount.current.activeVersion)) {
    const timeSinceRewardEndTime = currentTime - nomineeAccount.rewardEndTime * 1000
    if (nomineeAccount.rewardEndTime > 0 && timeSinceRewardEndTime < stakeLockTime) {
      return {
        unlocked: false,
        reason: 'Stake lock period active from last reward end time.',
        remainingTime: stakeLockTime - timeSinceRewardEndTime,
      }
    }
  } else {
    const timeSinceLastStake = currentTime - nominatorAccount.operatorAccountInfo.lastStakeTimestamp
    if (timeSinceLastStake < stakeLockTime) {
      return {
        unlocked: false,
        reason: 'Stake lock period active from last staking/unstaking action.',
        remainingTime: stakeLockTime - timeSinceLastStake,
      }
    }
  }

  // SLT from when node was selected to go active (started syncing)
  const node = shardus.getNodeByPubKey(nomineeAccount.id)
  if (node) {
    const timeSinceSyncing = currentTime - node.syncingTimestamp * 1000
    if (timeSinceSyncing < stakeLockTime) {
      return {
        unlocked: false,
        reason: 'Stake lock period active from node starting to sync.',
        remainingTime: stakeLockTime - timeSinceSyncing,
      }
    }
  }

  const timeSinceActive = currentTime - nomineeAccount.rewardStartTime * 1000
  if (timeSinceActive < stakeLockTime) {
    return {
      unlocked: false,
      reason: 'Stake lock period active from last active state.',
      remainingTime: stakeLockTime - timeSinceActive,
    }
  }

  // SLT from time of last went active
  const timeSinceInactive = currentTime - nomineeAccount.rewardEndTime * 1000
  if (timeSinceInactive < stakeLockTime) {
    return {
      unlocked: false,
      reason: 'Stake lock period active from last inactive/exit state.',
      remainingTime: stakeLockTime - timeSinceInactive,
    }
  }

  // SLT from time of last went inactive/exit
  return {
    unlocked: true,
    reason: '',
    remainingTime: 0,
  }
}
