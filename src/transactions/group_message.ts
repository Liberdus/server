import * as crypto from '../crypto'
import { Shardus, ShardusTypes, nestedCountersInstance } from '@shardus/core'
import * as utils from '../utils'
import * as config from '../config'
import { UserAccount, GroupAccount, WrappedStates, Tx, AppReceiptData, TXTypes } from '../@types'
import { SafeBigIntMath } from '../utils/safeBigIntMath'
import * as AccountsStorage from '../storage/accountStorage'
import { isUserAccount, isGroupAccount } from '../@types/accountTypeGuards'

/**
 * One MLS application message appended to the group transcript.
 *
 * This is the hot path, so it deliberately touches only two accounts —
 * [from, groupId] — exactly like a 1:1 message. Writing to every member's
 * account would make a 50-member group a 50-account transaction and destroy
 * sharding; members are notified by polling the group account instead.
 *
 * There is no toll: groups have no two-party toll analogue. Spam is bounded by
 * the network fee plus a per-member send interval held in the group account.
 */
export const validate_fields = (tx: Tx.GroupMessage, response: ShardusTypes.IncomingTransactionResult): ShardusTypes.IncomingTransactionResult => {
  if (utils.isValidAddress(tx.from) === false) {
    response.reason = 'tx "from" is not a valid address.'
    return response
  }
  if (utils.isValidAddress(tx.groupId) === false) {
    response.reason = 'tx "groupId" is not a valid address.'
    return response
  }
  if (typeof tx.message !== 'string' || tx.message.length === 0) {
    response.reason = 'tx "message" field must be a non-empty string.'
    return response
  }
  const messageSizeInKb = Buffer.byteLength(tx.message, 'utf8') / 1024
  if (messageSizeInKb > config.LiberdusFlags.groupMessageSizeLimit) {
    response.reason = `tx "message" size must be less than ${config.LiberdusFlags.groupMessageSizeLimit} kB.`
    return response
  }
  if (typeof tx.epoch !== 'number' || !Number.isInteger(tx.epoch) || tx.epoch < 0) {
    response.reason = 'tx "epoch" must be a non-negative integer.'
    return response
  }
  if (typeof tx.fee !== 'bigint') {
    response.reason = 'tx "fee" must be a bigint.'
    return response
  }
  if (!tx.sign || !tx.sign.owner || !tx.sign.sig || tx.sign.owner !== tx.from) {
    response.reason = 'not signed by from account'
    return response
  }
  if (crypto.verifyObj(tx) === false) {
    response.reason = 'incorrect signing'
    return response
  }
  response.success = true
  return response
}

export const validate = (
  tx: Tx.GroupMessage,
  wrappedStates: WrappedStates,
  response: ShardusTypes.IncomingTransactionResult,
  dapp: Shardus,
): ShardusTypes.IncomingTransactionResult => {
  const from: UserAccount = wrappedStates[tx.from] && wrappedStates[tx.from].data
  const group: GroupAccount = wrappedStates[tx.groupId] && wrappedStates[tx.groupId].data

  if (typeof from === 'undefined' || from === null) {
    response.reason = '"from" account does not exist.'
    return response
  }
  if (!isUserAccount(from)) {
    response.reason = 'from account is not a UserAccount'
    return response
  }
  if (typeof group === 'undefined' || group === null) {
    response.reason = '"groupId" account does not exist.'
    return response
  }
  if (!isGroupAccount(group)) {
    response.reason = 'groupId account is not a GroupAccount'
    return response
  }
  if (!group.members.includes(tx.from)) {
    response.reason = 'sender is not a member of this group.'
    return response
  }

  /*
   * The epoch is recorded but NOT enforced.
   *
   * A member may legitimately send at epoch N while a commit to N+1 is already
   * in flight; MLS clients retain old-epoch keys and can still decrypt. Failing
   * the transaction here would drop valid messages during every membership
   * change. Clients use the recorded epoch to pick the right key schedule.
   */

  // Per-member send throttle. Cheap griefing defence until group economics land.
  const lastSentAt = group.lastMessageAt[tx.from] || 0
  const minInterval = config.LiberdusFlags.groupMessageMinIntervalMs
  if (minInterval > 0 && lastSentAt > 0 && tx.timestamp - lastSentAt < minInterval) {
    response.reason = `sending too fast; minimum interval between group messages is ${minInterval}ms.`
    return response
  }

  const transactionFee = utils.getTransactionFeeWei(AccountsStorage.cachedNetworkAccount)
  if (transactionFee > tx.fee) {
    response.success = false
    response.reason = `The network transaction fee (${transactionFee}) is greater than the transaction fee provided (${tx.fee}).`
    return response
  }
  if (from.data.balance < transactionFee) {
    response.reason = `from account does not have sufficient funds ${from.data.balance} to cover the transaction fee (${transactionFee}).`
    return response
  }

  response.success = true
  response.reason = 'This transaction is valid!'
  return response
}

/**
 * Trims application-message history. Handshakes are deliberately untouched:
 * dropping a commit a member has not yet applied would lock that member out of
 * the group permanently, with no error the network can observe.
 */
const pruneMessages = (group: GroupAccount, txTimestamp: number, dapp: Shardus): void => {
  const retentionDays = config.LiberdusFlags.groupMessageRetentionDays
  if (retentionDays > 0) {
    const cutoffTimestamp = txTimestamp - retentionDays * 24 * 60 * 60 * 1000
    const before = group.messages.length
    group.messages = group.messages.filter((msg) => msg.timestamp >= cutoffTimestamp)
    if (config.LiberdusFlags.VerboseLogs && before !== group.messages.length) {
      dapp.log(`group messages after retention cleanup, kept ${group.messages.length} of ${before}`)
      nestedCountersInstance.countEvent('liberdus-group-retention', `cleaned-up older than ${retentionDays} days`)
    }
  }

  const maxLength = config.LiberdusFlags.groupMessageMaxLength
  if (maxLength > 0 && group.messages.length > maxLength) {
    group.messages = group.messages.slice(-maxLength)
    nestedCountersInstance.countEvent('liberdus-group-retention', `cleaned-up more than ${maxLength} messages`)
  }
}

export const apply = (
  tx: Tx.GroupMessage,
  txTimestamp: number,
  txId: string,
  wrappedStates: WrappedStates,
  dapp: Shardus,
  applyResponse: ShardusTypes.ApplyResponse,
): void => {
  const from: UserAccount = wrappedStates[tx.from].data
  const group: GroupAccount = wrappedStates[tx.groupId].data
  const network = AccountsStorage.cachedNetworkAccount

  const transactionFee = utils.getTransactionFeeWei(network)
  from.data.balance = SafeBigIntMath.subtract(from.data.balance, transactionFee)

  const maintenanceFee = utils.maintenanceAmount(txTimestamp, from, network)
  from.data.balance = SafeBigIntMath.subtract(from.data.balance, maintenanceFee)

  pruneMessages(group, txTimestamp, dapp)

  const messageRecord: Tx.GroupMessageRecord = {
    type: TXTypes.group_message,
    txId,
    from: tx.from,
    groupId: tx.groupId,
    epoch: tx.epoch,
    message: tx.message,
    timestamp: txTimestamp,
    sign: tx.sign,
  }
  group.messages.push(messageRecord)
  group.hasChats = true
  group.lastMessageAt[tx.from] = txTimestamp

  // Bumping the group timestamp is what wakes every member's poller.
  group.timestamp = txTimestamp
  from.timestamp = txTimestamp

  const appReceiptData: AppReceiptData = {
    txId,
    timestamp: txTimestamp,
    success: true,
    from: tx.from,
    to: tx.groupId,
    type: tx.type,
    transactionFee,
    additionalInfo: {
      maintenanceFee,
      groupId: tx.groupId,
      epoch: tx.epoch,
    },
  }
  const appReceiptDataHash = crypto.hashObj(appReceiptData)
  dapp.applyResponseAddReceiptData(applyResponse, appReceiptData, appReceiptDataHash)
  dapp.log('Applied group_message tx', tx.groupId, tx.from)
}

export const createFailedAppReceiptData = (
  tx: Tx.GroupMessage,
  txTimestamp: number,
  txId: string,
  wrappedStates: WrappedStates,
  dapp: Shardus,
  applyResponse: ShardusTypes.ApplyResponse,
  reason: string,
): void => {
  const from: UserAccount = wrappedStates[tx.from] && wrappedStates[tx.from].data
  let transactionFee = BigInt(0)
  if (from !== undefined && from !== null) {
    const networkFee = utils.getTransactionFeeWei(AccountsStorage.cachedNetworkAccount)
    if (from.data.balance >= networkFee) {
      transactionFee = networkFee
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
    to: tx.groupId,
    type: tx.type,
    transactionFee,
    additionalInfo: { groupId: tx.groupId },
  }
  const appReceiptDataHash = crypto.hashObj(appReceiptData)
  dapp.applyResponseAddReceiptData(applyResponse, appReceiptData, appReceiptDataHash)
}

export const keys = (tx: Tx.GroupMessage, result: ShardusTypes.TransactionKeys): ShardusTypes.TransactionKeys => {
  result.sourceKeys = [tx.from]
  result.targetKeys = [tx.groupId]
  result.allKeys = [...result.sourceKeys, ...result.targetKeys]
  return result
}

export const memoryPattern = (tx: Tx.GroupMessage, result: ShardusTypes.TransactionKeys): ShardusTypes.ShardusMemoryPatternsInput => {
  return {
    rw: [tx.from, tx.groupId],
    wo: [],
    on: [],
    ri: [],
    ro: [],
  }
}

export const createRelevantAccount = (
  dapp: Shardus,
  account: UserAccount | GroupAccount,
  accountId: string,
  tx: Tx.GroupMessage,
  accountCreated = false,
): ShardusTypes.WrappedResponse => {
  if (!account) {
    throw Error('Account must exist in order to send a group message')
  }
  return dapp.createWrappedResponse(accountId, accountCreated, account.hash, account.timestamp, account)
}
