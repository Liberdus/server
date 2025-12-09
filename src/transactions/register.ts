import * as crypto from '../crypto'
import { Shardus, ShardusTypes } from '@shardus/core'
import create from '../accounts'
import { isValidUncompressedPublicKey, validatePQPublicKey } from '../utils/address'
import * as config from '../config'
import * as utils from '../utils'
import { AliasAccount, UserAccount, WrappedStates, Tx, AppReceiptData } from '../@types'
import * as ajvHelper from '../@types/ajvHelper'
import { isUserAccount, isAliasAccount } from '../@types/accountTypeGuards'

export const validate_fields = (tx: Tx.Register, response: ShardusTypes.IncomingTransactionResult): ShardusTypes.IncomingTransactionResult => {
  if (utils.isValidAddress(tx.aliasHash) === false) {
    response.reason = 'tx "aliasHash" is not a valid address.'
    return response
  }
  if (utils.isValidAddress(tx.from) === false) {
    response.reason = 'tx "from" is not a valid address.'
    return response
  }
  if (typeof tx.alias !== 'string') {
    response.reason = 'tx "alias" field must be a string.'
    return response
  }
  if (tx.alias.length > 20) {
    response.reason = 'tx "alias" field must be less than 21 characters (20 max)'
    return response
  }
  if (/[^A-Za-z0-9]+/g.test(tx.alias)) {
    response.reason = 'tx "alias" field may only contain alphanumeric characters'
    return response
  }

  if (tx.aliasHash !== crypto.hash(tx.alias)) {
    response.reason = 'alias hash does not match alias'
    return response
  }

  if (isValidUncompressedPublicKey(tx.publicKey) === false) {
    response.reason = 'Invalid public key'
    return response
  }

  if (tx.pqPublicKey && validatePQPublicKey(tx.pqPublicKey) === false) {
    response.reason = 'Invalid post-quantum public key'
    return response
  }

  if (tx.private !== undefined && typeof tx.private !== 'boolean') {
    response.reason = 'tx "private" field must be a boolean or undefined.'
    return response
  }

  if (!tx.sign || !tx.sign.owner || !tx.sign.sig || tx.sign.owner !== tx.from) {
    response.reason = 'not signed by from account'
    return response
  }

  if (crypto.verifyObj(tx) === false) {
    response.reason = 'tx signature is incorrect'
    return response
  }

  response.success = true
  return response
}

export const validate = (
  tx: Tx.Register,
  wrappedStates: WrappedStates,
  response: ShardusTypes.IncomingTransactionResult,
  dapp: Shardus,
): ShardusTypes.IncomingTransactionResult => {
  const from: UserAccount = wrappedStates[tx.from] && wrappedStates[tx.from].data
  const alias: AliasAccount = wrappedStates[tx.aliasHash] && wrappedStates[tx.aliasHash].data
  if (from && !isUserAccount(from)) {
    response.reason = 'from account is not a UserAccount'
    return response
  }
  if (!alias) {
    response.reason = 'Alias account was not found for some reason'
    return response
  }
  if (!isAliasAccount(alias)) {
    response.reason = 'aliasHash account is not an AliasAccount'
    return response
  }
  if (from.alias !== null) {
    response.reason = 'User has already registered an alias'
    return response
  }
  if (alias.inbox === tx.alias) {
    response.reason = 'This alias is already taken'
    return response
  }
  if (alias.address !== '') {
    response.reason = 'This alias is already taken by another user'
    return response
  }

  response.success = true
  response.reason = 'This transaction is valid!'
  return response
}

export const apply = (
  tx: Tx.Register,
  txTimestamp: number,
  txId: string,
  wrappedStates: WrappedStates,
  dapp: Shardus,
  applyResponse: ShardusTypes.ApplyResponse,
): void => {
  const from: UserAccount = wrappedStates[tx.from].data
  const alias: AliasAccount = wrappedStates[tx.aliasHash].data
  // from.data.balance -= network.current.transactionFee
  // from.data.balance -= maintenanceAmount(txTimestamp, from)
  alias.inbox = tx.alias
  from.alias = tx.alias
  from.publicKey = tx.publicKey
  alias.address = tx.from

  if (tx.pqPublicKey) {
    from.pqPublicKey = tx.pqPublicKey
  }

  from.private = tx.private || false

  // from.data.transactions.push({ ...tx, txId })
  alias.timestamp = txTimestamp
  from.timestamp = txTimestamp

  const appReceiptData: AppReceiptData = {
    txId,
    timestamp: txTimestamp,
    success: true,
    from: tx.from,
    to: tx.aliasHash,
    type: tx.type,
    transactionFee: BigInt(0),
  }
  const appReceiptDataHash = crypto.hashObj(appReceiptData)
  dapp.applyResponseAddReceiptData(applyResponse, appReceiptData, appReceiptDataHash)
  dapp.log('Applied register tx', from, alias)
}

export const createFailedAppReceiptData = (
  tx: Tx.Register,
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
    to: tx.aliasHash,
    type: tx.type,
    transactionFee: BigInt(0),
  }
  const appReceiptDataHash = crypto.hashObj(appReceiptData)
  dapp.applyResponseAddReceiptData(applyResponse, appReceiptData, appReceiptDataHash)
}

export const keys = (tx: Tx.Register, result: ShardusTypes.TransactionKeys): ShardusTypes.TransactionKeys => {
  result.sourceKeys = [tx.from]
  result.targetKeys = [tx.aliasHash]
  result.allKeys = [...result.sourceKeys, ...result.targetKeys]
  return result
}

export const memoryPattern = (tx: Tx.Register, result: ShardusTypes.TransactionKeys): ShardusTypes.ShardusMemoryPatternsInput => {
  return {
    rw: [tx.from, tx.aliasHash],
    wo: [],
    on: [],
    ri: [],
    ro: [],
  }
}

export const createRelevantAccount = (
  dapp: Shardus,
  account: UserAccount | AliasAccount,
  accountId: string,
  tx: Tx.Register,
  accountCreated = false,
): ShardusTypes.WrappedResponse => {
  if (!account) {
    if (accountId === tx.aliasHash) {
      account = create.aliasAccount(accountId)
    } else {
      account = create.userAccount(accountId, tx.timestamp)
    }
    accountCreated = true
  }
  return dapp.createWrappedResponse(accountId, accountCreated, account.hash, account.timestamp, account)
}
