import * as crypto from '../crypto'
import { Shardus, ShardusTypes } from '@shardeum-foundation/core'
import * as utils from '../utils'
import * as config from '../config'
import { LiberdusFlags } from '../config'
import { Accounts, AppReceiptData, NetworkAccount, TollUnit, TransactionKeys, Tx, UserAccount, WrappedStates } from '../@types'
import * as AccountsStorage from '../storage/accountStorage'
import { SafeBigIntMath } from '../utils/safeBigIntMath'

export const validate_fields = (tx: Tx.Toll, response: ShardusTypes.IncomingTransactionResult) => {
  if (typeof tx.from !== 'string') {
    response.reason = 'tx "from" field must be a string.'
    return response
  }
  if (typeof tx.toll !== 'bigint') {
    response.reason = 'tx "toll" field must be a bigint.'
    return response
  }
  if (tx.tollUnit && !Object.values(TollUnit).includes(tx.tollUnit)) {
    response.reason = 'tx "tollUnit" field must be a valid TollUnit enum value.'
    return response
  }
  let tollInLib = tx.toll
  if (tx.tollUnit === TollUnit.usd) {
    tollInLib = utils.usdToWei(tx.toll, AccountsStorage.cachedNetworkAccount)
  }
  if (tollInLib > 0 && tollInLib < AccountsStorage.cachedNetworkAccount.current.minToll) {
    const minTollInLib = utils.weiToLib(AccountsStorage.cachedNetworkAccount.current.minToll)
    response.reason = `Minimum "toll" allowed is ${minTollInLib} LIB`
    return response
  }
  if (tx.toll > utils.libToWei(1000000)) {
    response.reason = 'Maximum toll allowed is 1,000,000 LIB or USD.'
    return response
  }
  response.success = true
  return response
}

export const validate = (tx: Tx.Toll, wrappedStates: WrappedStates, response: ShardusTypes.IncomingTransactionResult, dapp: Shardus) => {
  const from: Accounts = wrappedStates[tx.from] && wrappedStates[tx.from].data
  const network: NetworkAccount = wrappedStates[config.networkAccount].data
  if (tx.sign.owner !== tx.from) {
    response.reason = 'not signed by from account'
    return response
  }
  if (crypto.verifyObj(tx) === false) {
    response.reason = 'incorrect signing'
    return response
  }
  if (!from) {
    response.reason = 'from account does not exist'
    return response
  }
  if (from.data.balance < network.current.transactionFee) {
    response.reason = 'from account does not have sufficient funds to complete toll transaction'
    return response
  }
  if (tx.toll === undefined || tx.toll === null) {
    response.reason = 'Toll was not defined in the transaction'
    return response
  }
  let tollInWei = tx.toll
  if (tollInWei < 0) {
    response.reason = 'Toll cannot be negative'
    return response
  }
  if (LiberdusFlags.versionFlags.allowZeroToll === false) {
    if (tx.tollUnit === TollUnit.usd) {
      tollInWei = utils.usdToWei(tx.toll, network)
    }
    if (tollInWei < network.current.minToll) {
      response.reason = `Minimum "toll" allowed is ${utils.weiToLib(network.current.minToll)} LIB`
      return response
    }
    if (tollInWei > utils.libToWei(1000000)) {
      response.reason = 'Maximum toll allowed is 1,000,000 LIB'
      return response
    }
  } else if (LiberdusFlags.versionFlags.allowZeroToll && tollInWei > 0n) {
    if (tx.tollUnit === TollUnit.usd) {
      tollInWei = utils.usdToWei(tx.toll, network)
    }
    if (tollInWei < network.current.minToll) {
      response.reason = `Minimum "toll" allowed is ${utils.weiToLib(network.current.minToll)} LIB`
      return response
    }
    if (tollInWei > utils.libToWei(1000000)) {
      response.reason = 'Maximum toll allowed is 1,000,000 LIB'
      return response
    }
  }
  if (network) {
    if (network.current.transactionFee > tx.fee) {
      response.success = false
      response.reason = `The network transaction fee (${network.current.transactionFee}) is greater than the transaction fee provided (${tx.fee}).`
      return response
    }
  }
  response.success = true
  response.reason = 'This transaction is valid!'
  return response
}

export const apply = (
  tx: Tx.Toll,
  txTimestamp: number,
  txId: string,
  wrappedStates: WrappedStates,
  dapp: Shardus,
  applyResponse: ShardusTypes.ApplyResponse,
): void => {
  const from: UserAccount = wrappedStates[tx.from].data
  const network: NetworkAccount = wrappedStates[config.networkAccount].data
  const transactionFee = network.current.transactionFee
  const maintenanceFee = utils.maintenanceAmount(txTimestamp, from, network)
  from.data.balance = SafeBigIntMath.subtract(from.data.balance, transactionFee)
  from.data.balance = SafeBigIntMath.subtract(from.data.balance, maintenanceFee)
  from.data.tollUnit = tx.tollUnit
  from.data.toll = tx.toll
  from.timestamp = txTimestamp

  const appReceiptData: AppReceiptData = {
    txId,
    timestamp: txTimestamp,
    success: true,
    from: tx.from,
    to: tx.from,
    type: tx.type,
    transactionFee,
    additionalInfo: {
      maintenanceFee,
    },
  }
  const appReceiptDataHash = crypto.hashObj(appReceiptData)
  dapp.applyResponseAddReceiptData(applyResponse, appReceiptData, appReceiptDataHash)
  dapp.log('Applied toll tx', from)
}

export const createFailedAppReceiptData = (
  tx: Tx.Toll,
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

export const keys = (tx: Tx.Toll, result: TransactionKeys) => {
  result.sourceKeys = [tx.from]
  result.targetKeys = [config.networkAccount]
  result.allKeys = [...result.sourceKeys, ...result.targetKeys]
  return result
}

export const memoryPattern = (tx: Tx.Toll, result: TransactionKeys): ShardusTypes.ShardusMemoryPatternsInput => {
  return {
    rw: [tx.from],
    wo: [],
    on: [],
    ri: [],
    ro: [config.networkAccount],
  }
}

export const createRelevantAccount = (dapp: Shardus, account: UserAccount, accountId: string, tx: Tx.Toll, accountCreated = false) => {
  if (!account) {
    throw new Error('Account must already exist for the toll transaction')
  }
  return dapp.createWrappedResponse(accountId, accountCreated, account.hash, account.timestamp, account)
}
