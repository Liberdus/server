import * as crypto from '../crypto'
import { Shardus, ShardusTypes } from '@shardeum-foundation/core'
import * as utils from '../utils'
import * as config from '../config'
import { Accounts, UserAccount, NetworkAccount, ChatAccount, WrappedStates, Tx, TransactionKeys, AppReceiptData } from '../@types'
import { toShardusAddress } from '../utils/address'
import { SafeBigIntMath } from '../utils/safeBigIntMath'
import * as AccountsStorage from '../storage/accountStorage'

export const validate_fields = (tx: Tx.UpdateChatToll, response: ShardusTypes.IncomingTransactionResult) => {
  if (typeof tx.from !== 'string' || utils.isValidAddress(tx.from) === false) {
    response.reason = 'tx "from" field must be a string.'
    return response
  }
  if (typeof tx.to !== 'string' && utils.isValidAddress(tx.to) === false) {
    response.reason = 'tx "from" field must be a string.'
    return response
  }
  if (typeof tx.chatId !== 'string' && utils.isValidAddress(tx.chatId) === false) {
    response.reason = 'tx "chatId" field must be a valid address string.'
    return response
  }
  if (tx.chatId !== utils.calculateChatId(tx.from, tx.to)) {
    response.reason = 'chatId is not calculated correctly for from and to addresses'
    return response
  }
  if (typeof tx.required !== 'number') {
    response.reason = 'tx "required" field must be a number.'
    return response
  }
  if ([0, 1, 2].includes(tx.required) === false) {
    response.reason = 'tx "required" field must be 0, 1, or 2.'
    return response
  }
  if (typeof tx.timestamp !== 'number') {
    response.reason = 'tx "timestamp" field must be a number.'
    return response
  }
  response.success = true
  return response
}

export const validate = (tx: Tx.UpdateChatToll, wrappedStates: WrappedStates, response: ShardusTypes.IncomingTransactionResult, dapp: Shardus) => {
  const clonedTx = { ...tx }
  if (config.LiberdusFlags.useEthereumAddress) {
    clonedTx.from = toShardusAddress(tx.from)
  }

  const from: Accounts = wrappedStates[clonedTx.from] && wrappedStates[clonedTx.from].data
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
  if ([0, 1, 2].includes(tx.required) === false) {
    response.reason = 'tx "required" field must be 0, 1, or 2.'
    return response
  }

  if (tx.timestamp <= chat.timestamp) {
    response.reason = 'tx "timestamp" field must be greater than the chat timestamp.'
    return response
  }

  response.success = true
  response.reason = 'This transaction is valid!'
  return response
}

export const apply = (
  tx: Tx.UpdateChatToll,
  txTimestamp: number,
  txId: string,
  wrappedStates: WrappedStates,
  dapp: Shardus,
  applyResponse: ShardusTypes.ApplyResponse,
): void => {
  const from: UserAccount = wrappedStates[tx.from].data
  const to: UserAccount = wrappedStates[tx.to].data
  const network: NetworkAccount = wrappedStates[config.networkAccount].data
  const chat: ChatAccount = wrappedStates[tx.chatId].data

  // Deduct transaction fee
  const transactionFee = utils.getTransactionFeeWei(AccountsStorage.cachedNetworkAccount)
  from.data.balance = SafeBigIntMath.subtract(from.data.balance, transactionFee)

  // Get user index
  const [addr1, addr2] = utils.sortAddresses(tx.from, tx.to)
  const userIndex = addr1 === tx.from ? 0 : 1

  // Update toll requirement
  chat.toll.required[userIndex] = tx.required

  // refund pending toll pools to other party
  if (chat.toll.payOnRead[userIndex] > 0n) {
    dapp.log('UpdateChatToll: Refunding payOnRead toll to other party')
    to.data.balance = SafeBigIntMath.add(to.data.balance, chat.toll.payOnRead[userIndex])
    chat.toll.payOnRead[userIndex] = 0n
    to.timestamp = txTimestamp
  }
  if (chat.toll.payOnReply[userIndex] > 0n) {
    dapp.log('UpdateChatToll: Refunding payOnReply toll to other party')
    to.data.balance = SafeBigIntMath.add(to.data.balance, chat.toll.payOnReply[userIndex])
    chat.toll.payOnReply[userIndex] = 0n
    to.timestamp = txTimestamp
  }

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
  }
  const appReceiptDataHash = crypto.hashObj(appReceiptData)
  dapp.applyResponseAddReceiptData(applyResponse, appReceiptData, appReceiptDataHash)

  dapp.log('Applied update_chat_toll tx', tx, chat, from)
}

export const createFailedAppReceiptData = (
  tx: Tx.UpdateChatToll,
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
  result.sourceKeys = [tx.chatId, tx.from, tx.to]
  result.targetKeys = [config.networkAccount]
  result.allKeys = [...result.sourceKeys, ...result.targetKeys]
  return result
}

export const memoryPattern = (tx: Tx.Read, result: TransactionKeys): ShardusTypes.ShardusMemoryPatternsInput => {
  return {
    rw: [tx.from, tx.to, tx.chatId], // to account is somewhat needed
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
