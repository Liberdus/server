import * as crypto from '../crypto'
import { Shardus, ShardusTypes, nestedCountersInstance } from '@shardeum-foundation/core'
import * as utils from '../utils'
import * as config from '../config'
import create from '../accounts'
import * as ajvHelper from '../@types/ajvHelper'
import {
  Accounts,
  UserAccount,
  ChatAccount,
  NetworkAccount,
  IssueAccount,
  WrappedStates,
  ProposalAccount,
  Tx,
  TransactionKeys,
  AppReceiptData,
  AJVSchemaEnum,
} from '../@types'
import { toShardusAddress, toShardusAddressWithKey } from '../utils/address'

export const validate_fields = (tx: Tx.Transfer, response: ShardusTypes.IncomingTransactionResult): ShardusTypes.IncomingTransactionResult => {
  if (typeof tx.from !== 'string' && utils.isValidAddress(tx.from) === false) {
    response.success = false
    response.reason = 'tx "from" field must be a string.'
    throw new Error(response.reason)
  }
  if (typeof tx.to !== 'string' && utils.isValidAddress(tx.to) === false) {
    response.success = false
    response.reason = 'tx "to" field must be a string.'
    throw new Error(response.reason)
  }
  if (typeof tx.amount !== 'bigint' || tx.amount <= BigInt(0)) {
    response.success = false
    response.reason = 'tx "amount" field must be a bigint and greater than 0.'
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
  if (tx.memo && typeof tx.memo !== 'string') {
    response.success = false
    response.reason = 'tx "memo" field must be a string.'
    throw new Error(response.reason)
  }
  if (tx.memo && tx.memo.length > config.LiberdusFlags.transferMemoLimit) {
    response.success = false
    response.reason = `tx "memo" size must be less than ${config.LiberdusFlags.transferMemoLimit} characters.`
    throw new Error(response.reason)
  }
  return response
}

export const validate = (
  tx: Tx.Transfer,
  wrappedStates: WrappedStates,
  response: ShardusTypes.IncomingTransactionResult,
  dapp: Shardus,
): ShardusTypes.IncomingTransactionResult => {
  const clonedTx = { ...tx }
  if (config.LiberdusFlags.useEthereumAddress) {
    clonedTx.from = toShardusAddress(tx.from)
    clonedTx.to = toShardusAddress(tx.to)
  }
  const from: Accounts = wrappedStates[clonedTx.from] && wrappedStates[clonedTx.from].data
  const to: Accounts = wrappedStates[clonedTx.to] && wrappedStates[clonedTx.to].data
  const network: NetworkAccount = wrappedStates[config.networkAccount].data
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
  if (to === undefined || to === null) {
    response.reason = "To account doesn't exist"
    return response
  }

  if (from.data.balance < tx.amount + network.current.transactionFee) {
    response.reason = "from account doesn't have sufficient balance to cover the transaction"
    return response
  }
  response.success = true
  response.reason = 'This transaction is valid!'
  return response
}

export const apply = (
  tx: Tx.Transfer,
  txTimestamp: number,
  txId: string,
  wrappedStates: WrappedStates,
  dapp: Shardus,
  applyResponse: ShardusTypes.ApplyResponse,
): void => {
  const from = wrappedStates[tx.from].data
  const to: UserAccount = wrappedStates[tx.to].data
  const network: NetworkAccount = wrappedStates[config.networkAccount].data
  const chat = wrappedStates[tx.chatId].data

  // update balances
  const transactionFee = network.current.transactionFee
  const maintenanceFee = utils.maintenanceAmount(txTimestamp, from, network)
  from.data.balance -= transactionFee + maintenanceFee
  from.data.balance -= tx.amount
  to.data.balance += tx.amount

  // store transfer data in chat
  if (!from.data.chats[tx.to]) {
    from.data.chats[tx.to] = {
      receivedTimestamp: 0,
      chatId: tx.chatId,
    }
  }
  to.data.chats[tx.from] = {
    receivedTimestamp: txTimestamp,
    chatId: tx.chatId,
  }
  to.data.chatTimestamp = txTimestamp
  chat.messages.push(tx)

  // update account timestamps
  from.timestamp = txTimestamp
  to.timestamp = txTimestamp
  chat.timestamp = txTimestamp

  const appReceiptData: AppReceiptData = {
    txId,
    timestamp: txTimestamp,
    success: true,
    from: tx.from,
    to: tx.to,
    type: tx.type,
    transactionFee,
    additionalInfo: {
      amount: tx.amount,
      maintenanceFee,
    },
  }
  const appReceiptDataHash = crypto.hashObj(appReceiptData)
  dapp.applyResponseAddReceiptData(applyResponse, appReceiptData, appReceiptDataHash)
  dapp.log('Applied transfer tx', from, to)
}

export const createFailedAppReceiptData = (
  tx: Tx.Transfer,
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
    additionalInfo: {
      amount: tx.amount,
    },
  }
  const appReceiptDataHash = crypto.hashObj(appReceiptData)
  dapp.applyResponseAddReceiptData(applyResponse, appReceiptData, appReceiptDataHash)
}

export const keys = (tx: Tx.Transfer, result: TransactionKeys) => {
  result.sourceKeys = [tx.chatId, tx.from]
  result.targetKeys = [tx.to, config.networkAccount]
  result.allKeys = [...result.sourceKeys, ...result.targetKeys]
  return result
}

export const memoryPattern = (tx: Tx.Transfer, result: TransactionKeys): ShardusTypes.ShardusMemoryPatternsInput => {
  const memoryPattern: ShardusTypes.ShardusMemoryPatternsInput = {
    rw: [tx.from, tx.to, tx.chatId],
    wo: [],
    on: [],
    ri: [],
    ro: [config.networkAccount],
  }
  return memoryPattern
}
export const createRelevantAccount = (dapp: Shardus, account: UserAccount | ChatAccount, accountId: string, tx: Tx.Transfer, accountCreated = false) => {
  if (!account) {
    if (accountId === tx.chatId) {
      account = create.chatAccount(accountId)
    } else {
      throw Error('Account must exist in order to send a message transaction')
    }
    accountCreated = true
  }
  return dapp.createWrappedResponse(accountId, accountCreated, account.hash, account.timestamp, account)
}
