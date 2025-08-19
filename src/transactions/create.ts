import { Shardus, ShardusTypes } from '@shardeum-foundation/core'
import create from '../accounts'
import * as config from '../config'
import { Accounts, UserAccount, WrappedStates, Tx, TransactionKeys, AppReceiptData } from '../@types'
import * as crypto from '../crypto'
import { SafeBigIntMath } from '../utils/safeBigIntMath'

export const validate_fields = (tx: Tx.Create, response: ShardusTypes.IncomingTransactionResult): ShardusTypes.IncomingTransactionResult => {
  if (typeof tx.from !== 'string') {
    response.reason = '"From" must be a string.'
    return response
  }
  if (typeof tx.amount !== 'bigint' || tx.amount <= BigInt(0)) {
    response.reason = 'tx "amount" field must be a bigint and greater than 0.'
    return response
  }
  response.success = true
  return response
}

export const validate = (
  tx: Tx.Create,
  wrappedStates: WrappedStates,
  response: ShardusTypes.IncomingTransactionResult,
  dapp: Shardus,
): ShardusTypes.IncomingTransactionResult => {
  const from: Accounts = wrappedStates[tx.from] && wrappedStates[tx.from].data
  if (from === undefined || from === null) {
    response.reason = "target account doesn't exist"
    return response
  }
  response.success = true
  response.reason = 'This transaction is valid!'
  return response
}

export const apply = (
  tx: Tx.Create,
  txTimestamp: number,
  txId: string,
  wrappedStates: WrappedStates,
  dapp: Shardus,
  applyResponse: ShardusTypes.ApplyResponse,
): void => {
  const from: UserAccount = wrappedStates[tx.from].data
  from.data.balance = SafeBigIntMath.add(from.data.balance, tx.amount)
  from.timestamp = txTimestamp
  // from.data.transactions.push({ ...tx, txId })

  const newAccount = wrappedStates[tx.from].accountCreated || false

  const appReceiptData: AppReceiptData = {
    txId,
    timestamp: txTimestamp,
    success: true,
    from: tx.from,
    to: tx.from,
    type: tx.type,
    transactionFee: BigInt(0),
    additionalInfo: {
      newAccount,
      amount: tx.amount,
    },
  }

  if (config.LiberdusFlags.versionFlags.createAppReceiptUpdate === false) {
    delete appReceiptData.additionalInfo
  }
  const appReceiptDataHash = crypto.hashObj(appReceiptData)
  dapp.applyResponseAddReceiptData(applyResponse, appReceiptData, appReceiptDataHash)
  dapp.log('Applied create tx', from)
}

export const createFailedAppReceiptData = (
  tx: Tx.Create,
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

export const keys = (tx: Tx.Create, result: TransactionKeys) => {
  result.sourceKeys = [tx.from]
  result.allKeys = [...result.sourceKeys]
  return result
}

export const memoryPattern = (tx: Tx.Create, result: TransactionKeys): ShardusTypes.ShardusMemoryPatternsInput => {
  return {
    rw: [tx.from],
    wo: [],
    on: [],
    ri: [],
    ro: [],
  }
}
export const createRelevantAccount = (dapp: Shardus, account: UserAccount, accountId: string, tx: Tx.Create, accountCreated = false) => {
  if (!account) {
    account = create.userAccount(accountId, tx.timestamp)
    accountCreated = true
  }
  return dapp.createWrappedResponse(accountId, accountCreated, account.hash, account.timestamp, account)
}
