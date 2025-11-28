import * as crypto from '../crypto'
import { Shardus, ShardusTypes } from '@shardeum-foundation/core'
import * as utils from '../utils'
import * as config from '../config'
import { Accounts, UserAccount, NetworkAccount, WrappedStates, Tx, TransactionKeys, AppReceiptData } from '../@types'
import { SafeBigIntMath } from '../utils/safeBigIntMath'
import * as AccountsStorage from '../storage/accountStorage'
import { getStakeRequiredWei } from '../utils'

export const validate_fields = (tx: Tx.Stake, response: ShardusTypes.IncomingTransactionResult) => {
  if (utils.isValidAddress(tx.from) === false) {
    response.reason = 'tx "from" is not a valid address.'
    return response
  }
  if (typeof tx.stake !== 'bigint') {
    response.reason = 'tx "stake" field must be a bigint.'
    return response
  }
  response.success = true
  return response
}

export const validate = (tx: Tx.Stake, wrappedStates: WrappedStates, response: ShardusTypes.IncomingTransactionResult, dapp: Shardus) => {
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
  if (from.data.balance < getStakeRequiredWei(AccountsStorage.cachedNetworkAccount)) {
    response.reason = `From account has insufficient balance, the cost required to receive node rewards is ${getStakeRequiredWei(
      AccountsStorage.cachedNetworkAccount,
    )}`
    return response
  }
  if (tx.stake < getStakeRequiredWei(AccountsStorage.cachedNetworkAccount)) {
    response.reason = `Stake amount sent: ${tx.stake} is less than the cost required to operate a node: ${getStakeRequiredWei(
      AccountsStorage.cachedNetworkAccount,
    )}`
    return response
  }
  response.success = true
  response.reason = 'This transaction is valid!'
  return response
}

export const apply = (
  tx: Tx.Stake,
  txTimestamp: number,
  txId: string,
  wrappedStates: WrappedStates,
  dapp: Shardus,
  applyResponse: ShardusTypes.ApplyResponse,
): void => {
  const from: UserAccount = wrappedStates[tx.from].data
  const network: NetworkAccount = wrappedStates[config.networkAccount].data
  const stakeAmount = getStakeRequiredWei(AccountsStorage.cachedNetworkAccount)
  from.data.balance = SafeBigIntMath.subtract(from.data.balance, stakeAmount)
  const transactionFee = utils.getTransactionFeeWei(AccountsStorage.cachedNetworkAccount)
  const maintenanceFee = utils.maintenanceAmount(txTimestamp, from, network)
  from.data.balance = SafeBigIntMath.subtract(from.data.balance, transactionFee)
  from.data.balance = SafeBigIntMath.subtract(from.data.balance, maintenanceFee)
  from.data.stake = stakeAmount
  from.timestamp = txTimestamp
  // from.data.transactions.push({ ...tx, txId })

  const appReceiptData: AppReceiptData = {
    txId,
    timestamp: txTimestamp,
    success: true,
    from: tx.from,
    to: tx.from,
    type: tx.type,
    transactionFee: transactionFee,
    additionalInfo: {
      maintenanceFee,
      stakeAmount,
    },
  }
  const appReceiptDataHash = crypto.hashObj(appReceiptData)
  dapp.applyResponseAddReceiptData(applyResponse, appReceiptData, appReceiptDataHash)
  dapp.log('Applied stake tx', from)
}

export const createFailedAppReceiptData = (
  tx: Tx.Stake,
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

export const keys = (tx: Tx.Stake, result: TransactionKeys) => {
  result.sourceKeys = [tx.from]
  result.targetKeys = [config.networkAccount]
  result.allKeys = [...result.sourceKeys, ...result.targetKeys]
  return result
}

export const memoryPattern = (tx: Tx.Stake, result: TransactionKeys): ShardusTypes.ShardusMemoryPatternsInput => {
  return {
    rw: [tx.from],
    wo: [],
    on: [],
    ri: [],
    ro: [config.networkAccount],
  }
}

export const createRelevantAccount = (dapp: Shardus, account: UserAccount, accountId: string, tx: Tx.Stake, accountCreated = false) => {
  if (!account) {
    throw new Error('Account must already exist in order to send the stake transaction')
  }
  return dapp.createWrappedResponse(accountId, accountCreated, account.hash, account.timestamp, account)
}
