import * as crypto from '../crypto'
import { Shardus, ShardusTypes } from '@shardeum-foundation/core'
import * as utils from '../utils'
import * as config from '../config'
import { UserAccount, NetworkAccount, ChatAccount, WrappedStates, Tx, TransactionKeys, AppReceiptData } from '../@types'
import { SafeBigIntMath } from '../utils/safeBigIntMath'
import * as AccountsStorage from '../storage/accountStorage'

export const validate_fields = (tx: Tx.Read, response: ShardusTypes.IncomingTransactionResult) => {
  if (utils.isValidAddress(tx.from) === false) {
    response.reason = 'tx "from" is not a valid address.'
    return response
  }
  if (utils.isValidAddress(tx.to) === false) {
    response.reason = 'tx "to" is not a valid address.'
    return response
  }
  if (utils.isValidAddress(tx.chatId) === false) {
    response.reason = 'tx "chatId" is not a valid address.'
    return response
  }
  if (tx.chatId !== utils.calculateChatId(tx.from, tx.to)) {
    response.reason = 'chatId is not calculated correctly for from and to addresses'
    return response
  }
  if (typeof tx.timestamp !== 'number') {
    response.reason = 'tx "timestamp" field must be a number.'
    return response
  }
  response.success = true
  return response
}

export const validate = (tx: Tx.Read, wrappedStates: WrappedStates, response: ShardusTypes.IncomingTransactionResult, dapp: Shardus) => {
  const from: UserAccount = wrappedStates[tx.from] && wrappedStates[tx.from].data
  const network: NetworkAccount = wrappedStates[config.networkAccount].data
  const chat: ChatAccount = wrappedStates[tx.chatId] && wrappedStates[tx.chatId].data

  if (tx.sign.owner !== tx.from) {
    response.reason = 'not signed by from account'
    return response
  }
  if (crypto.verifyObj(tx) === false) {
    response.reason = 'incorrect signing'
    return response
  }
  if (typeof from === 'undefined' || from === null) {
    response.reason = '"from" account does not exist.'
    return response
  }
  if (typeof chat === 'undefined' || chat === null) {
    response.reason = 'chat account does not exist.'
    return response
  }

  // Validate the user is part of this chat
  const [addr1, addr2] = utils.sortAddresses(tx.from, tx.to)
  if (tx.from !== addr1 && tx.from !== addr2) {
    response.reason = 'user is not a participant in this chat.'
    return response
  }

  // Ensure user has enough balance for transaction fee
  if (from.data.balance < utils.getTransactionFeeWei(AccountsStorage.cachedNetworkAccount)) {
    response.reason = `insufficient funds for transaction fee: ${utils.getTransactionFeeWei(AccountsStorage.cachedNetworkAccount)}`
    return response
  }

  // todo: add more validation checks here
  if (network) {
    if (utils.getTransactionFeeWei(AccountsStorage.cachedNetworkAccount) > tx.fee) {
      response.success = false
      response.reason = `The network transaction fee (${utils.getTransactionFeeWei(
        AccountsStorage.cachedNetworkAccount,
      )}) is greater than the transaction fee provided (${tx.fee}).`
      return response
    }
  }

  response.success = true
  response.reason = 'This transaction is valid!'
  return response
}

export const apply = (
  tx: Tx.Read,
  txTimestamp: number,
  txId: string,
  wrappedStates: WrappedStates,
  dapp: Shardus,
  applyResponse: ShardusTypes.ApplyResponse,
): void => {
  const from: UserAccount = wrappedStates[tx.from].data
  const network: NetworkAccount = wrappedStates[config.networkAccount].data
  const chat: ChatAccount = wrappedStates[tx.chatId].data

  // Deduct transaction fee
  const transactionFee = utils.getTransactionFeeWei(AccountsStorage.cachedNetworkAccount)
  from.data.balance = SafeBigIntMath.subtract(from.data.balance, transactionFee)

  let networkTollTaxFee = BigInt(0)

  // Get reader index
  const [addr1, addr2] = utils.sortAddresses(tx.from, tx.to)
  const readerIndex = addr1 === tx.from ? 0 : 1

  // Update read timestamp
  chat.read[readerIndex] = tx.timestamp

  // Handle payOnRead tolls if available and toll is required
  if (chat.toll.payOnRead[readerIndex] > 0n && chat.toll.required[readerIndex] === 1) {
    const readToll = chat.toll.payOnRead[readerIndex]
    networkTollTaxFee = (readToll * BigInt(network.current.tollNetworkTaxPercent) * 10n ** 18n) / (100n * 10n ** 18n)
    const userEarnedAmount = SafeBigIntMath.subtract(readToll, networkTollTaxFee)

    // Transfer toll to reader
    from.data.balance = SafeBigIntMath.add(from.data.balance, userEarnedAmount)

    // Clear the payOnRead amount
    chat.toll.payOnRead[readerIndex] = 0n
    dapp.log(`Reader ${tx.from} earned ${userEarnedAmount} for reading chat ${tx.chatId} and network earned ${networkTollTaxFee}`)
  }

  // Add read tx to chat
  chat.messages.push(tx)

  // Update timestamps
  chat.timestamp = txTimestamp
  from.timestamp = txTimestamp

  const appReceiptData: AppReceiptData = {
    txId,
    timestamp: txTimestamp,
    success: true,
    from: tx.from,
    to: tx.to,
    type: tx.type,
    transactionFee,
    additionalInfo: {
      networkTollTaxFee,
    },
  }

  if (config.LiberdusFlags.versionFlags.tollTaxFeeinAppReceipt === false) {
    delete appReceiptData.additionalInfo
  }
  const appReceiptDataHash = crypto.hashObj(appReceiptData)
  dapp.applyResponseAddReceiptData(applyResponse, appReceiptData, appReceiptDataHash)

  dapp.log('Applied read tx', chat, from)
}

export const createFailedAppReceiptData = (
  tx: Tx.Read,
  txTimestamp: number,
  txId: string,
  wrappedStates: WrappedStates,
  dapp: Shardus,
  applyResponse: ShardusTypes.ApplyResponse,
  reason: string,
): void => {
  // Deduct transaction fee from the sender's balance
  const network: NetworkAccount = wrappedStates[config.networkAccount].data
  const from: UserAccount = wrappedStates[tx.from].data
  let transactionFee = BigInt(0)
  if (from !== undefined && from !== null) {
    if (from.data.balance >= utils.getTransactionFeeWei(AccountsStorage.cachedNetworkAccount)) {
      transactionFee = utils.getTransactionFeeWei(AccountsStorage.cachedNetworkAccount)
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
    from: tx.from,
    to: tx.to,
    type: tx.type,
    transactionFee,
  }
  const appReceiptDataHash = crypto.hashObj(appReceiptData)
  dapp.applyResponseAddReceiptData(applyResponse, appReceiptData, appReceiptDataHash)
}

export const keys = (tx: Tx.Read, result: TransactionKeys) => {
  result.sourceKeys = [tx.chatId, tx.from]
  result.targetKeys = [config.networkAccount]
  result.allKeys = [...result.sourceKeys, ...result.targetKeys]
  return result
}

export const memoryPattern = (tx: Tx.Read, result: TransactionKeys): ShardusTypes.ShardusMemoryPatternsInput => {
  return {
    rw: [tx.from, tx.chatId], // to account is not really needed
    wo: [],
    on: [],
    ri: [],
    ro: [config.networkAccount],
  }
}

export const createRelevantAccount = (dapp: Shardus, account: UserAccount | ChatAccount, accountId: string, tx: Tx.Read, accountCreated = false) => {
  if (!account) {
    throw Error('Both chat and user accounts must exist for read transactions')
  }
  return dapp.createWrappedResponse(accountId, accountCreated, account.hash, account.timestamp, account)
}
