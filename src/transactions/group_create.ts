import * as crypto from '../crypto'
import { Shardus, ShardusTypes } from '@shardus/core'
import * as utils from '../utils'
import create from '../accounts'
import * as config from '../config'
import { UserAccount, GroupAccount, WrappedStates, Tx, AppReceiptData } from '../@types'
import { SafeBigIntMath } from '../utils/safeBigIntMath'
import * as AccountsStorage from '../storage/accountStorage'
import { isUserAccount } from '../@types/accountTypeGuards'

/**
 * Creates the GroupAccount backing a new MLS group. The founder is the only
 * member at epoch 0; everyone else joins through group_commit.
 *
 * The group id is client-computed as hash(from + groupNonce) so it can be named
 * in keys() before the account exists — the same pattern dao_proposal_create
 * uses for tx.proposalId. The nonce is random rather than a counter so two
 * concurrent creations by one account cannot collide.
 */
export const validate_fields = (tx: Tx.GroupCreate, response: ShardusTypes.IncomingTransactionResult): ShardusTypes.IncomingTransactionResult => {
  if (utils.isValidAddress(tx.from) === false) {
    response.reason = 'tx "from" is not a valid address.'
    return response
  }
  if (utils.isValidAddress(tx.groupId) === false) {
    response.reason = 'tx "groupId" is not a valid address.'
    return response
  }
  if (typeof tx.groupNonce !== 'string' || tx.groupNonce.length !== 64) {
    response.reason = 'tx "groupNonce" must be a 32-byte hex string.'
    return response
  }
  if (tx.groupId !== utils.calculateGroupId(tx.from, tx.groupNonce)) {
    response.reason = 'groupId is not calculated correctly from "from" and "groupNonce".'
    return response
  }
  if (typeof tx.mlsGroupId !== 'string' || tx.mlsGroupId.length === 0) {
    response.reason = 'tx "mlsGroupId" must be a non-empty string.'
    return response
  }
  if (typeof tx.cipherSuite !== 'number' || !Number.isInteger(tx.cipherSuite) || tx.cipherSuite <= 0) {
    response.reason = 'tx "cipherSuite" must be a positive integer.'
    return response
  }
  if (typeof tx.meta !== 'string') {
    response.reason = 'tx "meta" must be a string.'
    return response
  }
  if (Buffer.byteLength(tx.meta, 'utf8') / 1024 > config.LiberdusFlags.groupMessageSizeLimit) {
    response.reason = `tx "meta" size must be less than ${config.LiberdusFlags.groupMessageSizeLimit} kB.`
    return response
  }
  if (
    typeof tx.maxMembers !== 'number' ||
    !Number.isInteger(tx.maxMembers) ||
    tx.maxMembers < 1 ||
    tx.maxMembers > config.LiberdusFlags.groupMaxMembers
  ) {
    response.reason = `tx "maxMembers" must be an integer between 1 and ${config.LiberdusFlags.groupMaxMembers}.`
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
  tx: Tx.GroupCreate,
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
  // createRelevantAccount produces a fresh GroupAccount; a populated one means
  // this groupId is already taken.
  if (group && group.epoch > 0) {
    response.reason = 'group already exists'
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

export const apply = (
  tx: Tx.GroupCreate,
  txTimestamp: number,
  txId: string,
  wrappedStates: WrappedStates,
  dapp: Shardus,
  applyResponse: ShardusTypes.ApplyResponse,
): void => {
  const from: UserAccount = wrappedStates[tx.from].data
  const group: GroupAccount = wrappedStates[tx.groupId].data

  if (!group) {
    throw Error('getRelevantAccount must be called before apply')
  }

  const transactionFee = utils.getTransactionFeeWei(AccountsStorage.cachedNetworkAccount)
  from.data.balance = SafeBigIntMath.subtract(from.data.balance, transactionFee)

  // Point the founder's own client at the group through the existing chats
  // discovery path, and bump chatTimestamp so the collector long-poll fires.
  if (!from.data.chats[tx.groupId]) {
    from.data.chats[tx.groupId] = {
      receivedTimestamp: txTimestamp,
      chatId: tx.groupId,
    }
  }
  from.data.chatTimestamp = txTimestamp

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
      groupId: tx.groupId,
      cipherSuite: tx.cipherSuite,
      maxMembers: tx.maxMembers,
    },
  }
  const appReceiptDataHash = crypto.hashObj(appReceiptData)
  dapp.applyResponseAddReceiptData(applyResponse, appReceiptData, appReceiptDataHash)
  dapp.log('Applied group_create tx', group, from)
}

export const createFailedAppReceiptData = (
  tx: Tx.GroupCreate,
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

export const keys = (tx: Tx.GroupCreate, result: ShardusTypes.TransactionKeys): ShardusTypes.TransactionKeys => {
  result.sourceKeys = [tx.from]
  result.targetKeys = [tx.groupId]
  result.allKeys = [...result.sourceKeys, ...result.targetKeys]
  return result
}

export const memoryPattern = (tx: Tx.GroupCreate, result: ShardusTypes.TransactionKeys): ShardusTypes.ShardusMemoryPatternsInput => {
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
  tx: Tx.GroupCreate,
  accountCreated = false,
): ShardusTypes.WrappedResponse => {
  if (!account) {
    if (accountId === tx.groupId) {
      account = create.groupAccount(accountId, tx, tx.timestamp)
      accountCreated = true
    } else {
      throw Error('Account must exist in order to create a group')
    }
  }
  return dapp.createWrappedResponse(accountId, accountCreated, account.hash, account.timestamp, account)
}
