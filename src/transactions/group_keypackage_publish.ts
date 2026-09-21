import * as crypto from '../crypto'
import { Shardus, ShardusTypes } from '@shardus/core'
import * as utils from '../utils'
import * as config from '../config'
import { UserAccount, WrappedStates, Tx, AppReceiptData } from '../@types'
import { SafeBigIntMath } from '../utils/safeBigIntMath'
import * as AccountsStorage from '../storage/accountStorage'
import { isUserAccount } from '../@types/accountTypeGuards'

/**
 * Publishes MLS KeyPackages so other accounts can add this one to a group.
 *
 * KeyPackages are single-use: group_commit pops the one it consumes from this
 * pool in the same transaction. Reusing an init key across two adds would
 * undermine forward secrecy, which is why the pool exists rather than a single
 * static key. `lastResortKeyPackage` is the RFC 9420 s10 fallback for when the
 * pool empties — reusable, with a documented post-compromise-security caveat.
 *
 * Publishing replaces the pool wholesale, so a client that has rotated its MLS
 * identity (for example after an account restore, where the signature key is
 * recoverable from pqSeed but the HPKE keys are not) can cleanly invalidate the
 * stale packages.
 */
export const validate_fields = (
  tx: Tx.GroupKeyPackagePublish,
  response: ShardusTypes.IncomingTransactionResult,
): ShardusTypes.IncomingTransactionResult => {
  if (utils.isValidAddress(tx.from) === false) {
    response.reason = 'tx "from" is not a valid address.'
    return response
  }
  if (!Array.isArray(tx.keyPackages)) {
    response.reason = 'tx "keyPackages" must be an array.'
    return response
  }
  if (tx.keyPackages.length === 0 && !tx.lastResortKeyPackage) {
    response.reason = 'tx must publish at least one key package.'
    return response
  }
  if (tx.keyPackages.length > config.LiberdusFlags.groupMaxKeyPackagesPerAccount) {
    response.reason = `tx "keyPackages" must contain at most ${config.LiberdusFlags.groupMaxKeyPackagesPerAccount} entries.`
    return response
  }
  for (const kp of tx.keyPackages) {
    if (typeof kp !== 'string' || kp.length === 0) {
      response.reason = 'each key package must be a non-empty base64 string.'
      return response
    }
  }
  if (tx.lastResortKeyPackage !== undefined && typeof tx.lastResortKeyPackage !== 'string') {
    response.reason = 'tx "lastResortKeyPackage" must be a string when present.'
    return response
  }
  if (typeof tx.cipherSuite !== 'number' || !Number.isInteger(tx.cipherSuite) || tx.cipherSuite <= 0) {
    response.reason = 'tx "cipherSuite" must be a positive integer.'
    return response
  }

  const totalBytes = tx.keyPackages.reduce((sum, kp) => sum + Buffer.byteLength(kp, 'utf8'), 0) +
    (tx.lastResortKeyPackage ? Buffer.byteLength(tx.lastResortKeyPackage, 'utf8') : 0)
  if (totalBytes / 1024 > config.LiberdusFlags.groupMessageSizeLimit) {
    response.reason = `published key packages exceed ${config.LiberdusFlags.groupMessageSizeLimit} kB.`
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
  tx: Tx.GroupKeyPackagePublish,
  wrappedStates: WrappedStates,
  response: ShardusTypes.IncomingTransactionResult,
  dapp: Shardus,
): ShardusTypes.IncomingTransactionResult => {
  const from: UserAccount = wrappedStates[tx.from] && wrappedStates[tx.from].data

  if (typeof from === 'undefined' || from === null) {
    response.reason = '"from" account does not exist.'
    return response
  }
  if (!isUserAccount(from)) {
    response.reason = 'from account is not a UserAccount'
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
  tx: Tx.GroupKeyPackagePublish,
  txTimestamp: number,
  txId: string,
  wrappedStates: WrappedStates,
  dapp: Shardus,
  applyResponse: ShardusTypes.ApplyResponse,
): void => {
  const from: UserAccount = wrappedStates[tx.from].data

  const transactionFee = utils.getTransactionFeeWei(AccountsStorage.cachedNetworkAccount)
  from.data.balance = SafeBigIntMath.subtract(from.data.balance, transactionFee)

  from.data.mlsKeyPackages = [...tx.keyPackages]
  from.data.mlsCipherSuite = tx.cipherSuite
  if (tx.lastResortKeyPackage) {
    from.data.mlsLastResortKeyPackage = tx.lastResortKeyPackage
  }

  from.timestamp = txTimestamp

  const appReceiptData: AppReceiptData = {
    txId,
    timestamp: txTimestamp,
    success: true,
    from: tx.from,
    to: tx.from,
    type: tx.type,
    transactionFee,
    additionalInfo: {
      keyPackageCount: tx.keyPackages.length,
      cipherSuite: tx.cipherSuite,
    },
  }
  const appReceiptDataHash = crypto.hashObj(appReceiptData)
  dapp.applyResponseAddReceiptData(applyResponse, appReceiptData, appReceiptDataHash)
  dapp.log('Applied group_keypackage_publish tx', from.id, tx.keyPackages.length)
}

export const createFailedAppReceiptData = (
  tx: Tx.GroupKeyPackagePublish,
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
    to: tx.from,
    type: tx.type,
    transactionFee,
    additionalInfo: {},
  }
  const appReceiptDataHash = crypto.hashObj(appReceiptData)
  dapp.applyResponseAddReceiptData(applyResponse, appReceiptData, appReceiptDataHash)
}

export const keys = (tx: Tx.GroupKeyPackagePublish, result: ShardusTypes.TransactionKeys): ShardusTypes.TransactionKeys => {
  result.sourceKeys = [tx.from]
  result.targetKeys = []
  result.allKeys = [...result.sourceKeys, ...result.targetKeys]
  return result
}

export const memoryPattern = (
  tx: Tx.GroupKeyPackagePublish,
  result: ShardusTypes.TransactionKeys,
): ShardusTypes.ShardusMemoryPatternsInput => {
  return {
    rw: [tx.from],
    wo: [],
    on: [],
    ri: [],
    ro: [],
  }
}

export const createRelevantAccount = (
  dapp: Shardus,
  account: UserAccount,
  accountId: string,
  tx: Tx.GroupKeyPackagePublish,
  accountCreated = false,
): ShardusTypes.WrappedResponse => {
  if (!account) {
    throw Error('Account must exist in order to publish key packages')
  }
  return dapp.createWrappedResponse(accountId, accountCreated, account.hash, account.timestamp, account)
}
