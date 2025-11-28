import * as crypto from '../crypto'
import { Shardus, ShardusTypes } from '@shardeum-foundation/core'
import * as config from '../config'
import * as utils from '../utils'
import { Utils } from '@shardeum-foundation/lib-types'
import create from '../accounts'
import {
  Accounts,
  UserAccount,
  NetworkAccount,
  DeveloperPayment,
  NodeAccount,
  OurAppDefinedData,
  WrappedStates,
  Tx,
  TransactionKeys,
  AppReceiptData,
} from '../@types'
import { SafeBigIntMath } from '../utils/safeBigIntMath'

export const validate_fields = (tx: Tx.DevPayment, response: ShardusTypes.IncomingTransactionResult) => {
  if (utils.isValidAddress(tx.nodeId) === false) {
    response.reason = 'tx "nodeId" is not a valid address.'
    return response
  }
  if (utils.isValidAddress(tx.from) === false) {
    response.reason = 'tx "from" is not a valid address.'
    return response
  }
  if (typeof tx.payment !== 'object') {
    response.reason = 'tx "payment" field must be an object.'
    return response
  }
  if (typeof tx.developer !== 'string') {
    response.reason = 'tx "developer" field must be a string.'
    return response
  }
  if (typeof tx.payment.id !== 'string') {
    response.reason = 'tx "payment.id" must be a string.'
    return response
  }
  if (typeof tx.payment.address !== 'string') {
    response.reason = 'tx "payment.address" must be a string.'
    return response
  }
  if (typeof tx.payment.amount !== 'bigint') {
    response.reason = 'tx "payment.amount" must be a bigint.'
    return response
  }
  if (typeof tx.payment.delay !== 'number') {
    response.reason = 'tx "payment.delay" must be a number.'
    return response
  }
  if (typeof tx.payment.timestamp !== 'number') {
    response.reason = 'tx "payment.timestamp" must be a number.'
    return response
  }
  response.success = true
  return response
}

export const validate = (tx: Tx.DevPayment, wrappedStates: WrappedStates, response: ShardusTypes.IncomingTransactionResult, dapp: Shardus) => {
  const from: UserAccount = wrappedStates[tx.from] && wrappedStates[tx.from].data
  const network: NetworkAccount = wrappedStates[config.networkAccount].data
  const developer: UserAccount = wrappedStates[tx.developer] && wrappedStates[tx.developer].data
  // let nodeInfo
  // try {
  //   nodeInfo = dapp.getNode(tx.nodeId)
  // } catch (err) {
  //   dapp.log(err)
  // }
  // if (!nodeInfo) {
  //   response.reason = 'no nodeInfo'
  //   return response
  // }
  if (tx.timestamp < tx.payment.timestamp) {
    response.reason = 'This payment is not ready to be released'
    return response
  }
  if (network.id !== config.networkAccount) {
    response.reason = 'To account must be the network account'
    return response
  }
  if (!network.developerFund.some((payment: DeveloperPayment) => payment.id === tx.payment.id)) {
    response.reason = 'This payment doesnt exist'
    return response
  }
  if (!developer || !developer.data) {
    response.reason = `No account exists for the passed in tx.developer ${tx.developer}`
    return response
  }
  if (tx.developer !== tx.payment.address) {
    response.reason = `tx developer ${tx.developer} does not match address in payment ${tx.payment.address}`
    return response
  }
  if (developer.data.payments.some((payment) => payment.id === tx.payment.id)) {
    response.reason = `This payment ${Utils.safeStringify(tx.payment)} has already been given to the developer ${tx.developer}`
    return response
  }
  response.success = true
  response.reason = 'This transaction is valid!'
  return response
}

export const apply = (
  tx: Tx.DevPayment,
  txTimestamp: number,
  txId: string,
  wrappedStates: WrappedStates,
  dapp: Shardus,
  applyResponse: ShardusTypes.ApplyResponse,
): void => {
  const from: NodeAccount = wrappedStates[tx.from].data

  const network: NetworkAccount = wrappedStates[config.networkAccount].data
  const developer: UserAccount = wrappedStates[tx.developer].data
  developer.data.payments.push(tx.payment)
  developer.data.balance = SafeBigIntMath.add(developer.data.balance, tx.payment.amount)
  // developer.data.transactions.push({ ...tx, txId })

  const when = txTimestamp + config.ONE_SECOND * 10
  const value = {
    type: 'apply_developer_payment',
    timestamp: when,
    networkId: config.networkAccount,
    developerFund: network.developerFund.filter((payment: DeveloperPayment) => payment.id !== tx.payment.id),
  } as Tx.ApplyDevPayment

  const addressHash = wrappedStates[config.networkAccount].stateId
  const ourAppDefinedData = applyResponse.appDefinedData as OurAppDefinedData
  // [TODO] - Calculate the afterStateHash if old DAO is active
  const afterStateHash = ''
  ourAppDefinedData.globalMsg = { address: config.networkAccount, addressHash, value, when, source: from.id, afterStateHash }

  developer.timestamp = txTimestamp
  from.timestamp = txTimestamp

  const appReceiptData: AppReceiptData = {
    txId,
    timestamp: txTimestamp,
    success: true,
    from: tx.from,
    to: tx.developer,
    type: tx.type,
    transactionFee: BigInt(0),
  }
  const appReceiptDataHash = crypto.hashObj(appReceiptData)
  dapp.applyResponseAddReceiptData(applyResponse, appReceiptData, appReceiptDataHash)
  dapp.log('Applied developer_payment tx', from, developer, tx.payment)
}

export const createFailedAppReceiptData = (
  tx: Tx.DevPayment,
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
    to: tx.developer,
    type: tx.type,
    transactionFee: BigInt(0),
  }
  const appReceiptDataHash = crypto.hashObj(appReceiptData)
  dapp.applyResponseAddReceiptData(applyResponse, appReceiptData, appReceiptDataHash)
}

export const transactionReceiptPass = (
  tx: Tx.DevPayment,
  txId: string,
  wrappedStates: WrappedStates,
  dapp: Shardus,
  applyResponse: ShardusTypes.ApplyResponse,
): void => {
  const { address, addressHash, value, when, source, afterStateHash } = (applyResponse.appDefinedData as OurAppDefinedData).globalMsg
  dapp.setGlobal(address, addressHash, value, when, source, afterStateHash)
  dapp.log('PostApplied developer_payment tx')
}

export const keys = (tx: Tx.DevPayment, result: TransactionKeys) => {
  result.sourceKeys = [tx.from]
  result.targetKeys = [tx.developer, config.networkAccount]
  result.allKeys = [...result.sourceKeys, ...result.targetKeys]
  return result
}

export const memoryPattern = (tx: Tx.DevPayment, result: TransactionKeys): ShardusTypes.ShardusMemoryPatternsInput => {
  return {
    rw: [tx.from, tx.developer],
    wo: [],
    on: [],
    ri: [],
    ro: [config.networkAccount],
  }
}

export const createRelevantAccount = (dapp: Shardus, account: NodeAccount, accountId: string, tx: Tx.DevPayment, accountCreated = false) => {
  if (!account) {
    account = create.nodeAccount(accountId)
    accountCreated = true
  }
  return dapp.createWrappedResponse(accountId, accountCreated, account.hash, account.timestamp, account)
}
