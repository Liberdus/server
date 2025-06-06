import * as crypto from '../crypto'
import { Shardus, ShardusTypes } from '@shardeum-foundation/core'
import * as utils from '../utils'
import * as config from '../config'
import { Accounts, UserAccount, NetworkAccount, ChatAccount, WrappedStates, Tx, TransactionKeys } from '../@types'
import { toShardusAddress } from '../utils/address'

export const validate_fields = (tx: Tx.Read, response: ShardusTypes.IncomingTransactionResult) => {
  if (typeof tx.from !== 'string' && utils.isValidAddress(tx.from) === false) {
    response.success = false
    response.reason = 'tx "from" field must be a string.'
    throw new Error(response.reason)
  }
  if (typeof tx.to !== 'string' && utils.isValidAddress(tx.to) === false) {
    response.success = false
    response.reason = 'tx "from" field must be a string.'
    throw new Error(response.reason)
  }
  if (typeof tx.chatId !== 'string' && utils.isValidAddress(tx.chatId) === false) {
    response.success = false
    response.reason = 'tx "chatId" field must be a valid address string.'
    throw new Error(response.reason)
  }
  if (tx.chatId !== utils.calculateChatId(tx.from, tx.to)) {
    response.success = false
    response.reason = 'chatId is not calculated correctly for from and to addresses'
    throw new Error(response.reason)
  }
  if (typeof tx.timestamp !== 'number') {
    response.success = false
    response.reason = 'tx "timestamp" field must be a number.'
    throw new Error(response.reason)
  }
  return response
}

export const validate = (tx: Tx.Read, wrappedStates: WrappedStates, response: ShardusTypes.IncomingTransactionResult, dapp: Shardus) => {
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
  if (from.data.balance < network.current.transactionFee) {
    response.reason = `insufficient funds for transaction fee: ${network.current.transactionFee}`
    return response
  }

  // todo: add more validation checks here

  response.success = true
  response.reason = 'This transaction is valid!'
  return response
}

export const apply = (tx: Tx.Read, txTimestamp: number, txId: string, wrappedStates: WrappedStates, dapp: Shardus) => {
  const from: UserAccount = wrappedStates[tx.from].data
  const network: NetworkAccount = wrappedStates[config.networkAccount].data
  const chat: ChatAccount = wrappedStates[tx.chatId].data

  // Deduct transaction fee
  from.data.balance -= network.current.transactionFee

  // Get reader index
  const [addr1, addr2] = utils.sortAddresses(tx.from, tx.to)
  const readerIndex = addr1 === tx.from ? 0 : 1

  // Update read timestamp
  chat.read[readerIndex] = tx.timestamp

  // Handle payOnRead tolls if available and toll is required
  if (chat.toll.payOnRead[readerIndex] > 0n && chat.toll.required[readerIndex] === 1) {
    const readToll = chat.toll.payOnRead[readerIndex]
    const networkFee = (readToll * BigInt(network.current.tollNetworkTaxPercent) * 10n ** 18n) / (100n * 10n ** 18n)
    const userEarnedAmount = readToll - networkFee

    // Transfer toll to reader
    from.data.balance += userEarnedAmount

    // Clear the payOnRead amount
    chat.toll.payOnRead[readerIndex] = 0n
    dapp.log(`Reader ${tx.from} earned ${userEarnedAmount} for reading chat ${tx.chatId} and network earned ${networkFee}`)
  }

  // Add read tx to chat
  chat.messages.push(tx)

  // Update timestamps
  chat.timestamp = txTimestamp
  from.timestamp = txTimestamp

  dapp.log('Applied read tx', chat, from)
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
