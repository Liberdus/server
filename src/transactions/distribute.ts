import * as crypto from '../crypto'
import { Shardus, ShardusTypes } from '@shardeum-foundation/core'
import * as utils from '../utils'
import * as config from '../config'
import { Accounts, UserAccount, NetworkAccount, WrappedStates, Tx, AppReceiptData } from '../@types'
import { SafeBigIntMath } from '../utils/safeBigIntMath'
import * as AccountsStorage from '../storage/accountStorage'

export const validate_fields = (tx: Tx.Distribute, response: ShardusTypes.IncomingTransactionResult): ShardusTypes.IncomingTransactionResult => {
  if (utils.isValidAddress(tx.from) === false) {
    response.reason = 'tx "from" is not a valid address.'
    return response
  }
  if (Array.isArray(tx.recipients) !== true) {
    response.reason = 'tx "recipients" field must be an array.'
    return response
  }
  if (typeof tx.amount !== 'bigint' || tx.amount <= BigInt(0)) {
    response.reason = 'tx "amount" field must be a positive bigint.'
    return response
  }
  response.success = true
  return response
}

export const validate = (
  tx: Tx.Distribute,
  wrappedStates: WrappedStates,
  response: ShardusTypes.IncomingTransactionResult,
  dapp: Shardus,
): ShardusTypes.IncomingTransactionResult => {
  const from: Accounts = wrappedStates[tx.from] && wrappedStates[tx.from].data
  const network: NetworkAccount = wrappedStates[config.networkAccount].data
  const recipients: UserAccount[] = tx.recipients.map((id: string) => wrappedStates[id].data)

  if (tx.sign.owner !== tx.from) {
    response.reason = 'not signed by from account'
    return response
  }
  if (crypto.verifyObj(tx) === false) {
    response.reason = 'incorrect signing'
    return response
  }
  if (from === undefined || from === null) {
    response.reason = "from account doesn't exist"
    return response
  }
  for (const user of recipients) {
    if (!user) {
      response.reason = 'no account for one of the recipients'
      return response
    }
  }
  if (from.data.balance < BigInt(recipients.length) * tx.amount + utils.getTransactionFeeWei(AccountsStorage.cachedNetworkAccount)) {
    response.reason = "from account doesn't have sufficient balance to cover the transaction"
    return response
  }

  response.success = true
  response.reason = 'This transaction is valid!'
  return response
}

export const apply = (
  tx: Tx.Distribute,
  txTimestamp: number,
  txId: string,
  wrappedStates: WrappedStates,
  dapp: Shardus,
  applyResponse: ShardusTypes.ApplyResponse,
): void => {
  const from: UserAccount = wrappedStates[tx.from].data
  const network: NetworkAccount = wrappedStates[config.networkAccount].data
  const recipients: UserAccount[] = tx.recipients.map((id: string) => wrappedStates[id].data)
  const transactionFee = utils.getTransactionFeeWei(AccountsStorage.cachedNetworkAccount)
  from.data.balance = SafeBigIntMath.subtract(from.data.balance, transactionFee)
  // from.data.transactions.push({ ...tx, txId })
  for (const user of recipients) {
    from.data.balance = SafeBigIntMath.subtract(from.data.balance, tx.amount)
    user.data.balance = SafeBigIntMath.add(user.data.balance, tx.amount)
    // user.data.transactions.push({ ...tx, txId })
  }
  const maintenanceFee = utils.maintenanceAmount(txTimestamp, from, network)
  from.data.balance = SafeBigIntMath.subtract(from.data.balance, maintenanceFee)

  const appReceiptData: AppReceiptData = {
    txId,
    timestamp: txTimestamp,
    success: true,
    from: tx.from,
    // Multiple recipients
    // to: ,
    type: tx.type,
    transactionFee: BigInt(0),
    additionalInfo: {
      maintenanceFee,
    },
  }
  const appReceiptDataHash = crypto.hashObj(appReceiptData)
  dapp.applyResponseAddReceiptData(applyResponse, appReceiptData, appReceiptDataHash)
  dapp.log('Applied distribute transaction', from, recipients)
}

export const createFailedAppReceiptData = (
  tx: Tx.Distribute,
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
    // Multiple recipients
    // to: ,
    type: tx.type,
    transactionFee: BigInt(0),
  }
  const appReceiptDataHash = crypto.hashObj(appReceiptData)
  dapp.applyResponseAddReceiptData(applyResponse, appReceiptData, appReceiptDataHash)
}

export const keys = (tx: Tx.Distribute, result: ShardusTypes.TransactionKeys): ShardusTypes.TransactionKeys => {
  result.sourceKeys = [tx.from]
  result.targetKeys = [...tx.recipients, config.networkAccount]
  result.allKeys = [...result.sourceKeys, ...result.targetKeys]
  return result
}

export const memoryPattern = (tx: Tx.Distribute, result: ShardusTypes.TransactionKeys): ShardusTypes.ShardusMemoryPatternsInput => {
  return {
    rw: [tx.from, ...tx.recipients],
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
  tx: Tx.Distribute,
  accountCreated = false,
): ShardusTypes.WrappedResponse => {
  if (!account) {
    throw new Error('Account must exist in order to send a distribute transaction')
  }
  return dapp.createWrappedResponse(accountId, accountCreated, account.hash, account.timestamp, account)
}
