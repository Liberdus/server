import * as crypto from '../../crypto'
import { Shardus, ShardusTypes } from '@shardeum-foundation/core'
import * as utils from './../../utils'
import * as config from './../../config'
import * as AccountsStorage from '../../storage/accountStorage'
import create from './../../accounts'
import { UserAccount, WrappedStates, Tx, TransactionKeys, NodeAccount, Accounts, AppReceiptData, NetworkAccount } from './../../@types'

export const validate_fields = (tx: Tx.DepositStake, response: ShardusTypes.IncomingTransactionResult) => {
  if (typeof tx.nominator !== 'string' && utils.isValidAddress(tx.nominator) === false) {
    response.reason = 'tx "nominator" field must be a string or valid address.'
    return response
  }
  if (typeof tx.nominee !== 'string' && utils.isValidAddress(tx.nominee) === false) {
    response.reason = 'tx "nominee" field must be a string or valid address.'
    return response
  }
  if (typeof tx.stake !== 'bigint' && tx.stake <= BigInt(0)) {
    response.reason = 'tx "stake" field must be a bigint and stake must be greater than 0.'
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

export const validate = (tx: Tx.DepositStake, wrappedStates: WrappedStates, response: ShardusTypes.IncomingTransactionResult, dapp: Shardus) => {
  const nominatorAccount: UserAccount = wrappedStates[tx.nominator] && wrappedStates[tx.nominator].data
  const nodeAccount: NodeAccount = wrappedStates[tx.nominee] && wrappedStates[tx.nominee].data
  if (typeof nominatorAccount === 'undefined' || nominatorAccount === null) {
    response.reason = 'nominator account does not exist'
    return response
  }
  let existingStake = BigInt(0)
  if (nominatorAccount.operatorAccountInfo) {
    if (nominatorAccount.operatorAccountInfo.nominee) {
      if (nominatorAccount.operatorAccountInfo.nominee !== tx.nominee) {
        response.reason = 'nominator account has already staked to a different nominee'
        return response
      }
    }
    if (nominatorAccount.operatorAccountInfo.stake) {
      existingStake = nominatorAccount.operatorAccountInfo.stake
    }
  }

  if (nodeAccount && nodeAccount.nominator) {
    if (nodeAccount.nominator !== tx.nominator) {
      response.reason = 'nominee account has already been staked by another nominator'
      return response
    }
  }
  const restakeCooldown = AccountsStorage.cachedNetworkAccount.current.restakeCooldown
  if (nodeAccount && isRestakingAllowed(nodeAccount, dapp.shardusGetTime()).restakeAllowed === false) {
    response.reason = `This node was staked within the last ${restakeCooldown / config.ONE_MINUTE} minutes. You can't stake more to this node yet!`
    return response
  }
  if (nominatorAccount.data.balance < tx.stake) {
    response.reason = `Nominator account has balance ${nominatorAccount.data.balance} less than the stake amount ${tx.stake}`
    return response
  }
  const minStakeAmountUsd = AccountsStorage.cachedNetworkAccount.current.stakeRequiredUsd
  const minStakeAmount = utils.scaleByStabilityFactor(minStakeAmountUsd, AccountsStorage.cachedNetworkAccount)
  if (tx.stake + existingStake < minStakeAmount) {
    response.reason = `Stake amount sent: ${tx.stake} is less than the minimum required stake amount: ${minStakeAmount}`
    return response
  }
  response.success = true
  response.reason = 'This transaction is valid!'
  return response
}

export const apply = (
  tx: Tx.DepositStake,
  txTimestamp: number,
  txId: string,
  wrappedStates: WrappedStates,
  dapp: Shardus,
  applyResponse: ShardusTypes.ApplyResponse,
): void => {
  const nominatorAccount: UserAccount = wrappedStates[tx.nominator].data
  const nodeAccount: NodeAccount = wrappedStates[tx.nominee] && wrappedStates[tx.nominee].data
  if (nominatorAccount.operatorAccountInfo == null) {
    nominatorAccount.operatorAccountInfo = {
      stake: BigInt(0),
      nominee: '',
      certExp: 0,
      lastStakeTimestamp: 0,
      operatorStats: {
        totalNodeReward: BigInt(0),
        totalNodePenalty: BigInt(0),
        totalNodeTime: 0,
        history: [],
        totalUnstakeReward: BigInt(0),
        unstakeCount: 0,
        lastStakedNodeKey: '',
      },
    }
  }
  const txFeeUsd = AccountsStorage.cachedNetworkAccount.current.transactionFee
  const txFee = utils.scaleByStabilityFactor(txFeeUsd, AccountsStorage.cachedNetworkAccount)
  // [TODO] check if the maintainance fee is also needed in deposit_stake tx
  const maintenanceFee = utils.maintenanceAmount(txTimestamp, nominatorAccount, AccountsStorage.cachedNetworkAccount)
  const totalAmountToDeduct = tx.stake + txFee + maintenanceFee
  if (nominatorAccount.data.balance < totalAmountToDeduct) {
    throw new Error('Nominator account does not have enough balance to stake')
  }
  nominatorAccount.data.balance -= totalAmountToDeduct
  nominatorAccount.operatorAccountInfo.stake += tx.stake
  nominatorAccount.operatorAccountInfo.nominee = tx.nominee
  nominatorAccount.operatorAccountInfo.certExp = 0
  nominatorAccount.operatorAccountInfo.lastStakeTimestamp = txTimestamp

  console.log('nodeAccount.stakeLock', nodeAccount.stakeLock, tx.stake)
  nodeAccount.stakeLock += tx.stake
  nodeAccount.nominator = tx.nominator
  nodeAccount.stakeTimestamp = txTimestamp

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
      stake: tx.stake,
      totalStake: nodeAccount.stakeLock,
    },
  }

  const appReceiptDataHash = crypto.hashObj(appReceiptData)
  dapp.applyResponseAddReceiptData(applyResponse, appReceiptData, appReceiptDataHash)
  dapp.log('Applied deposit_stake tx', nominatorAccount, nodeAccount)
}

export const createFailedAppReceiptData = (
  tx: Tx.DepositStake,
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
    const txFee = utils.scaleByStabilityFactor(txFeeUsd, AccountsStorage.cachedNetworkAccount)
    if (from.data.balance >= txFee) {
      transactionFee = txFee
      from.data.balance -= transactionFee
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
    additionalInfo: {
      stake: tx.stake,
    },
  }
  const appReceiptDataHash = crypto.hashObj(appReceiptData)
  dapp.applyResponseAddReceiptData(applyResponse, appReceiptData, appReceiptDataHash)
}

export const keys = (tx: Tx.DepositStake, result: TransactionKeys) => {
  result.sourceKeys = [tx.nominator]
  result.targetKeys = [tx.nominee]
  result.allKeys = [...result.sourceKeys, ...result.targetKeys]
  return result
}

export const memoryPattern = (tx: Tx.DepositStake, result: TransactionKeys): ShardusTypes.ShardusMemoryPatternsInput => {
  return {
    rw: [tx.nominator, tx.nominee],
    wo: [],
    on: [],
    ri: [],
    ro: [],
  }
}

export const createRelevantAccount = (dapp: Shardus, account: UserAccount | NodeAccount, accountId: string, tx: Tx.DepositStake, accountCreated = false) => {
  if (!account) {
    if (accountId === tx.nominee) {
      account = create.nodeAccount(accountId)
    } else if (accountId === tx.nominator) {
      throw new Error('Nominator account must already exist in order to perform the deposit_stake transaction')
    }
    accountCreated = true
  }
  return dapp.createWrappedResponse(accountId, accountCreated, account.hash, account.timestamp, account)
}

export function isRestakingAllowed(
  nomineeAccount: NodeAccount,
  currentTime: number,
): {
  restakeAllowed: boolean
  reason: string
  remainingTime: number
} {
  if (nomineeAccount == null) {
    return {
      restakeAllowed: false,
      reason: 'Nominee account not found.',
      remainingTime: 0,
    }
  }
  if (nomineeAccount.stakeTimestamp === 0) {
    return {
      restakeAllowed: true,
      reason: 'Nominee account stake timestamp not found.',
      remainingTime: 0,
    }
  }
  const restakeCooldown = AccountsStorage.cachedNetworkAccount.current.restakeCooldown
  const restakeAllowedTime = nomineeAccount.stakeTimestamp + restakeCooldown
  const remainingTime = Math.max(restakeAllowedTime - currentTime, 0)
  const reason = `Restaking is not allowed yet. Please wait ${Math.ceil(remainingTime / 1000)} seconds.`
  const restakeAllowed = remainingTime <= 0
  return {
    restakeAllowed,
    reason: restakeAllowed ? '' : reason,
    remainingTime,
  }
}
