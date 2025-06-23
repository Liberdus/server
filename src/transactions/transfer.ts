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
  TollUnit,
} from '../@types'
import { toShardusAddress, toShardusAddressWithKey } from '../utils/address'
import { SafeBigIntMath } from '../utils/safeBigIntMath'

export const validate_fields = (tx: Tx.Transfer, response: ShardusTypes.IncomingTransactionResult): ShardusTypes.IncomingTransactionResult => {
  if (typeof tx.from !== 'string' || utils.isValidAddress(tx.from) === false) {
    response.reason = 'tx "from" field must be a string.'
    return response
  }
  if (typeof tx.to !== 'string' && utils.isValidAddress(tx.to) === false) {
    response.reason = 'tx "to" field must be a string.'
    return response
  }
  if (typeof tx.amount !== 'bigint' || tx.amount <= BigInt(0)) {
    response.reason = 'tx "amount" field must be a bigint and greater than 0.'
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
  if (tx.memo && typeof tx.memo !== 'string') {
    response.reason = 'tx "memo" field must be a string.'
    return response
  }
  if (tx.memo && tx.memo.length > config.LiberdusFlags.transferMemoLimit) {
    response.reason = `tx "memo" size must be less than ${config.LiberdusFlags.transferMemoLimit} characters.`
    return response
  }
  response.success = true
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
  const from: UserAccount = wrappedStates[clonedTx.from] && wrappedStates[clonedTx.from].data
  const to: UserAccount = wrappedStates[clonedTx.to] && wrappedStates[clonedTx.to].data
  const chatAccount: ChatAccount = wrappedStates[tx.chatId] && wrappedStates[tx.chatId].data
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
  // if there is a memo, check if the amount is larger than the Toll required for the chat
  if (config.LiberdusFlags.versionFlags.minTransferAmountCheck) {
    const hasMemo = (tx.memo && tx.memo.length > 0) || (tx.xmemo && tx.xmemo.message && tx.xmemo.message.length > 0)
    console.log('hasMemo', tx, hasMemo)
    let shouldSendMinToll = false
    if (chatAccount == null && hasMemo) {
      // new chat. sender should send at least the toll set by the receiver
      shouldSendMinToll = true
    } else if (chatAccount !== undefined && chatAccount !== null) {
      // chat account exists, check the required toll
      const [address1, address2] = utils.sortAddresses(tx.from, tx.to)
      const receiverIndex = tx.to === address1 ? 0 : 1
      const receiverBlockedSender = chatAccount.toll.required[receiverIndex] === 2

      // if the receiver has blocked the sender, they cannot send messages or coins
      if (receiverBlockedSender) {
        response.reason = 'Receiver has blocked the sender from sending messages or coins.'
        return response
      }

      const receiverDemandsToll = chatAccount.toll.required[receiverIndex] === 1
      if (hasMemo && receiverDemandsToll) {
        // tx has a memo and receiver demands toll, so sender should send at least the minimum amount
        shouldSendMinToll = true
      }
    }
    if (shouldSendMinToll) {
      let tollInWei = to.data.toll
      if (to.data.tollUnit === TollUnit.usd) {
        tollInWei = utils.usdToWei(to.data.toll, network)
      }
      if (tx.amount < tollInWei) {
        response.reason = `You must send at least ${utils.weiToLib(tollInWei)} LIB to this user.`
        return response
      }
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
  from.data.balance = SafeBigIntMath.subtract(from.data.balance, transactionFee)
  from.data.balance = SafeBigIntMath.subtract(from.data.balance, maintenanceFee)
  from.data.balance = SafeBigIntMath.subtract(from.data.balance, tx.amount)
  to.data.balance = SafeBigIntMath.add(to.data.balance, tx.amount)

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
      account = create.chatAccount(accountId, tx)
    } else {
      throw Error('Account must exist in order to send a message transaction')
    }
    accountCreated = true
  }
  return dapp.createWrappedResponse(accountId, accountCreated, account.hash, account.timestamp, account)
}
