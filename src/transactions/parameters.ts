import { Shardus, ShardusTypes } from '@shardus/core'
import * as config from '../config'
import create from '../accounts'
import * as utils from '../utils'
import { NodeAccount, OurAppDefinedData, NetworkAccount, IssueAccount, WrappedStates, Tx, AppReceiptData } from '../@types'
import * as crypto from '../crypto'
import { isIssueAccount } from '../@types/accountTypeGuards'

export const validate_fields = (tx: Tx.Parameters, response: ShardusTypes.IncomingTransactionResult): ShardusTypes.IncomingTransactionResult => {
  if (utils.isValidAddress(tx.nodeId) === false) {
    response.reason = 'tx "nodeId" is not a valid address.'
    return response
  }
  if (utils.isValidAddress(tx.from) === false) {
    response.reason = 'tx "from" is not a valid address.'
    return response
  }
  if (typeof tx.issue !== 'string') {
    response.reason = 'tx "issue" field must be a string'
    return response
  }
  if (!tx.sign || !tx.sign.owner || !tx.sign.sig || tx.sign.owner !== tx.from) {
    response.reason = 'not signed by from account'
    return response
  }
  if (crypto.verifyObj(tx, true) === false) {
    response.reason = 'incorrect signing'
    return response
  }
  response.success = true
  return response
}

export const validate = (
  tx: Tx.Parameters,
  wrappedStates: WrappedStates,
  response: ShardusTypes.IncomingTransactionResult,
  dapp: Shardus,
): ShardusTypes.IncomingTransactionResult => {
  const network: NetworkAccount = wrappedStates[config.networkAccount].data
  const issue: IssueAccount = wrappedStates[tx.issue].data

  if (network.id !== config.networkAccount) {
    response.reason = 'To account must be the network account'
    return response
  }
  if (!issue) {
    response.reason = "Issue doesn't exist"
    return response
  }
  if (!isIssueAccount(issue)) {
    response.reason = 'issue account is not an IssueAccount'
    return response
  }
  if (issue.active === false) {
    response.reason = 'This issue is no longer active'
    return response
  }
  if (tx.timestamp < network.windows.applyWindow[0] || tx.timestamp > network.windows.applyWindow[1]) {
    response.reason = 'Network is not within the time window to apply parameters'
    return response
  }
  response.success = true
  response.reason = 'This transaction is valid!'
  return response
}

export const apply = (
  tx: Tx.Parameters,
  txTimestamp: number,
  txId: string,
  wrappedStates: WrappedStates,
  dapp: Shardus,
  applyResponse: ShardusTypes.ApplyResponse,
): void => {
  const from: NodeAccount = wrappedStates[tx.from].data

  const network: NetworkAccount = wrappedStates[config.networkAccount].data
  const issue: IssueAccount = wrappedStates[tx.issue].data

  const when = txTimestamp + config.ONE_SECOND * 10
  const value = {
    type: 'apply_parameters',
    timestamp: when,
    networkId: config.networkAccount,
    current: network.next,
    next: {},
    windows: network.nextWindows,
    nextWindows: {},
    issue: network.issue + 1,
  } as Tx.ApplyParameters

  const addressHash = wrappedStates[config.networkAccount].stateId
  const ourAppDefinedData = applyResponse.appDefinedData as OurAppDefinedData
  // [TODO] - Calculate the afterStateHash if old DAO is active
  const afterStateHash = ''
  ourAppDefinedData.globalMsg = { address: config.networkAccount, addressHash, value, when, source: from.id, afterStateHash }

  issue.active = false

  from.timestamp = txTimestamp
  issue.timestamp = txTimestamp

  const appReceiptData: AppReceiptData = {
    txId,
    timestamp: txTimestamp,
    success: true,
    from: tx.from,
    to: tx.issue,
    type: tx.type,
    transactionFee: BigInt(0),
  }
  const appReceiptDataHash = crypto.hashObj(appReceiptData)
  dapp.applyResponseAddReceiptData(applyResponse, appReceiptData, appReceiptDataHash)
  dapp.log('Applied parameters tx', txId, tx, issue, value)
}

export const createFailedAppReceiptData = (
  tx: Tx.Parameters,
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
    to: tx.issue,
    type: tx.type,
    transactionFee: BigInt(0),
  }
  const appReceiptDataHash = crypto.hashObj(appReceiptData)
  dapp.applyResponseAddReceiptData(applyResponse, appReceiptData, appReceiptDataHash)
}

export const transactionReceiptPass = (
  tx: Tx.Tally,
  txId: string,
  wrappedStates: WrappedStates,
  dapp: Shardus,
  applyResponse: ShardusTypes.ApplyResponse,
): void => {
  const { address, addressHash, value, when, source, afterStateHash } = (applyResponse.appDefinedData as OurAppDefinedData).globalMsg
  dapp.setGlobal(address, addressHash, value, when, source, afterStateHash)
  dapp.log('PostApplied parameters tx', address, value, when, source)
}

export const keys = (tx: Tx.Parameters, result: ShardusTypes.TransactionKeys): ShardusTypes.TransactionKeys => {
  result.sourceKeys = [tx.from]
  result.targetKeys = [config.networkAccount, tx.issue]
  result.allKeys = [...result.sourceKeys, ...result.targetKeys]
  return result
}

export const memoryPattern = (tx: Tx.Parameters, result: ShardusTypes.TransactionKeys): ShardusTypes.ShardusMemoryPatternsInput => {
  return {
    rw: [tx.from, tx.issue],
    wo: [],
    on: [],
    ri: [],
    ro: [config.networkAccount],
  }
}

export const createRelevantAccount = (
  dapp: Shardus,
  account: NodeAccount | IssueAccount,
  accountId: string,
  tx: Tx.Parameters,
  accountCreated = false,
): ShardusTypes.WrappedResponse => {
  if (!account) {
    account = create.nodeAccount(accountId)
    accountCreated = true
  }
  return dapp.createWrappedResponse(accountId, accountCreated, account.hash, account.timestamp, account)
}
