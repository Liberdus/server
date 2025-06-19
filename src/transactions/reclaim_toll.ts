import * as crypto from '../crypto'
import { Shardus, ShardusTypes } from '@shardeum-foundation/core'
import * as utils from '../utils'
import create from '../accounts'
import * as config from '../config'
import { Accounts, AppReceiptData, ChatAccount, NetworkAccount, TransactionKeys, Tx, UserAccount, WrappedStates } from '../@types'
import { toShardusAddress } from '../utils/address'

export const validate_fields = (tx: Tx.ReclaimToll, response: ShardusTypes.IncomingTransactionResult) => {
  if (typeof tx.from !== 'string' && utils.isValidAddress(tx.from) === false) {
    response.reason = 'tx "from" field must be a string.'
    return response
  }
  if (typeof tx.to !== 'string' && utils.isValidAddress(tx.to) === false) {
    response.reason = 'tx "to" field must be a string.'
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

  response.success = true
  return response
}

export const validate = (tx: Tx.ReclaimToll, wrappedStates: WrappedStates, response: ShardusTypes.IncomingTransactionResult, dapp: Shardus) => {
  const clonedTx = { ...tx }
  if (config.LiberdusFlags.useEthereumAddress) {
    clonedTx.from = toShardusAddress(tx.from)
    clonedTx.to = toShardusAddress(tx.to)
  }
  const from: Accounts = wrappedStates[clonedTx.from] && wrappedStates[clonedTx.from].data
  const network: NetworkAccount = wrappedStates[config.networkAccount].data
  const to: Accounts = wrappedStates[clonedTx.to] && wrappedStates[clonedTx.to].data
  const chat: ChatAccount = wrappedStates[tx.chatId] && wrappedStates[tx.chatId].data

  if (!from || !to) {
    response.reason = 'from or to account does not exist.'
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
  if (typeof from === 'undefined' || from === null) {
    response.reason = '"from" account does not exist.'
    return response
  }
  if (typeof to === 'undefined' || to === null) {
    response.reason = '"target" account does not exist.'
    return response
  }

  // Validate balance covers transaction fee
  if (from.data.balance < network.current.transactionFee) {
    response.reason = `from account does not have sufficient funds ${from.data.balance} to cover transaction fee (${network.current.transactionFee}).`
    return response
  }

  response.success = true
  response.reason = 'This transaction is valid!'
  return response
}

export const apply = (
  tx: Tx.ReclaimToll,
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
  let reclaimTollAmount = 0n

  if (config.LiberdusFlags.VerboseLogs) {
    dapp.log(`Applying message tx: ${txId}`, tx, from, to, chat)
  }

  if (!chat) {
    throw Error('getRelevantAccount must be called before apply')
  }

  // Deduct transaction fee
  from.data.balance -= network.current.transactionFee

  // Deduct maintenance fee
  from.data.balance -= utils.maintenanceAmount(txTimestamp, from, network)

  // Handle toll for new or existing chat
  const [addr1, addr2] = utils.sortAddresses(tx.from, tx.to)
  const userIndex = addr1 === tx.from ? 0 : 1
  const otherPartyIndex = 1 - userIndex

  // fail if the toll poll for other party (user's messages) is empty
  if (chat.toll.payOnReply[otherPartyIndex] === 0n) {
    if (config.LiberdusFlags.VerboseLogs) dapp.log(`txId: ${txId} chat has no toll to reclaim`, chat)
    from.timestamp = txTimestamp
    dapp.log('Applied message tx', chat, from, to)
    return
  }

  const otherPartyLastReadTime = chat.read[otherPartyIndex]

  // loop through messages not read by the other party and reclaim toll
  for (const message of chat.messages) {
    const messageAge = txTimestamp - message.timestamp
    if (utils.isMessageRecord(message) && tx.from === message.from && messageAge > network.current.tollTimeout && message.timestamp > otherPartyLastReadTime) {
      reclaimTollAmount += message.tollDeposited
    }
  }

  if (reclaimTollAmount > chat.toll.payOnReply[otherPartyIndex] + chat.toll.payOnRead[otherPartyIndex]) {
    // fail because this should not happen
    dapp.log(
      `txId: ${txId} reclaimTollAmount is greater than the total toll deposited`,
      reclaimTollAmount,
      chat.toll.payOnReply[otherPartyIndex],
      chat.toll.payOnRead[otherPartyIndex],
    )
    from.timestamp = txTimestamp
    dapp.log('Applied message tx', chat, from, to)
    return
  }

  // Transfer toll to the reclaiming party
  from.data.balance += reclaimTollAmount

  // Clear the toll pools of the other party by 50% of the reclaimed amount
  const halfReclaimTollAmount = reclaimTollAmount / 2n
  chat.toll.payOnRead[otherPartyIndex] -= halfReclaimTollAmount
  chat.toll.payOnReply[otherPartyIndex] -= halfReclaimTollAmount

  // prevent negative toll
  if (chat.toll.payOnRead[otherPartyIndex] < 0n) {
    chat.toll.payOnRead[otherPartyIndex] = 0n
  }
  if (chat.toll.payOnReply[otherPartyIndex] < 0n) {
    chat.toll.payOnReply[otherPartyIndex] = 0n
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
    transactionFee: network.current.transactionFee,
  }
  const appReceiptDataHash = crypto.hashObj(appReceiptData)
  dapp.applyResponseAddReceiptData(applyResponse, appReceiptData, appReceiptDataHash)

  dapp.log('Applied reclaim_toll tx', chat, from)
}

export const createFailedAppReceiptData = (
  tx: Tx.ReclaimToll,
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
    if (from.data.balance >= network.current.transactionFee) {
      transactionFee = network.current.transactionFee
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
    from: tx.from,
    to: tx.to,
    type: tx.type,
    transactionFee,
  }
  const appReceiptDataHash = crypto.hashObj(appReceiptData)
  dapp.applyResponseAddReceiptData(applyResponse, appReceiptData, appReceiptDataHash)
}

export const keys = (tx: Tx.ReclaimToll, result: TransactionKeys) => {
  result.sourceKeys = [tx.chatId, tx.from]
  result.targetKeys = [tx.to, config.networkAccount]
  result.allKeys = [...result.sourceKeys, ...result.targetKeys]
  return result
}

export const memoryPattern = (tx: Tx.ReclaimToll, result: TransactionKeys): ShardusTypes.ShardusMemoryPatternsInput => {
  return {
    rw: [tx.from, tx.to, tx.chatId],
    wo: [],
    on: [],
    ri: [],
    ro: [config.networkAccount],
  }
}

export const createRelevantAccount = (dapp: Shardus, account: UserAccount | ChatAccount, accountId: string, tx: Tx.ReclaimToll, accountCreated = false) => {
  if (!account) {
    if (accountId === tx.chatId) {
      account = create.chatAccount(accountId, tx)
    } else {
      throw Error('Account must exist in order to send a message transaction')
    }
    accountCreated = true
  }
  return dapp.createWrappedResponse(accountId, accountCreated, account.hash, account.timestamp, account)
}
