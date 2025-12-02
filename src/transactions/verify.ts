import * as crypto from '../crypto'
import { Shardus, ShardusTypes } from '@shardeum-foundation/core'
import create from '../accounts'
import * as utils from '../utils'
import * as config from '../config'
import { Accounts, UserAccount, NetworkAccount, WrappedStates, Tx, AppReceiptData } from '../@types'
import { SafeBigIntMath } from '../utils/safeBigIntMath'

export const validate_fields = (tx: Tx.Verify, response: ShardusTypes.IncomingTransactionResult): ShardusTypes.IncomingTransactionResult => {
  if (utils.isValidAddress(tx.from) === false) {
    response.reason = 'tx "from" is not a valid address.'
    return response
  }
  if (typeof tx.code !== 'string') {
    response.reason = 'tx "code" field must be a string.'
    return response
  }
  if (tx.code.length !== 6) {
    response.reason = 'tx "code" length must be 6 digits.'
    return response
  }
  if (typeof parseInt(tx.code) !== 'number') {
    response.reason = 'tx "code" field must be parseable to an integer.'
    return response
  }
  response.success = true
  return response
}

export const validate = (
  tx: Tx.Verify,
  wrappedStates: ShardusTypes.WrappedData,
  response: ShardusTypes.IncomingTransactionResult,
  dapp: Shardus,
): ShardusTypes.IncomingTransactionResult => {
  const from: Accounts = wrappedStates[tx.from] && wrappedStates[tx.from].data
  if (tx.sign.owner !== tx.from) {
    response.reason = 'not signed by from account'
    return response
  }
  if (crypto.verifyObj(tx) === false) {
    response.reason = 'incorrect signing'
    return response
  }
  if (typeof from.verified !== 'string') {
    response.reason = 'From account has not been sent a verification email'
    return response
  }
  if (typeof from.verified === 'boolean') {
    response.reason = 'From account has already been verified'
    return response
  }
  if (crypto.hash(tx.code) !== from.verified) {
    response.reason = 'Hash of code in tx does not match the hash of the verification code sent'
    return response
  }
  response.success = true
  response.reason = 'This transaction is valid!'
  return response
}

export const apply = (
  tx: Tx.Verify,
  txTimestamp: number,
  txId: string,
  wrappedStates: WrappedStates,
  dapp: Shardus,
  applyResponse: ShardusTypes.ApplyResponse,
): void => {
  const from: UserAccount = wrappedStates[tx.from].data
  const network: NetworkAccount = wrappedStates[config.networkAccount].data
  from.verified = true
  from.data.balance = SafeBigIntMath.add(from.data.balance, network.current.faucetAmount)
  from.timestamp = txTimestamp

  const appReceiptData: AppReceiptData = {
    txId,
    timestamp: txTimestamp,
    success: true,
    from: tx.from,
    to: tx.from,
    type: tx.type,
    transactionFee: BigInt(0),
    additionalInfo: {
      faucetAmount: network.current.faucetAmount,
    },
  }
  const appReceiptDataHash = crypto.hashObj(appReceiptData)
  dapp.applyResponseAddReceiptData(applyResponse, appReceiptData, appReceiptDataHash)
  dapp.log('Applied verify tx', from)
}

export const createFailedAppReceiptData = (
  tx: Tx.Verify,
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

export const keys = (tx: Tx.Verify, result: ShardusTypes.TransactionKeys): ShardusTypes.TransactionKeys => {
  result.sourceKeys = [tx.from]
  result.targetKeys = [config.networkAccount]
  result.allKeys = [...result.sourceKeys, ...result.targetKeys]
  return result
}

export const memoryPattern = (tx: Tx.Verify, result: ShardusTypes.TransactionKeys): ShardusTypes.ShardusMemoryPatternsInput => {
  const memoryPattern: ShardusTypes.ShardusMemoryPatternsInput = {
    rw: [tx.from],
    wo: [],
    on: [],
    ri: [],
    ro: [config.networkAccount],
  }
  return memoryPattern
}

export const createRelevantAccount = (
  dapp: Shardus,
  account: UserAccount,
  accountId: string,
  tx: Tx.Verify,
  accountCreated = false,
): ShardusTypes.WrappedResponse => {
  if (!account) {
    account = create.userAccount(accountId, tx.timestamp)
    accountCreated = true
  }
  return dapp.createWrappedResponse(accountId, accountCreated, account.hash, account.timestamp, account)
}
