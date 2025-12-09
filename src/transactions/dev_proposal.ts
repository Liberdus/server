import * as crypto from '../crypto'
import { Shardus, ShardusTypes } from '@shardus/core'
import Decimal from 'decimal.js'
import * as utils from '../utils'
import create from '../accounts'
import _ from 'lodash'
import * as config from '../config'
import { UserAccount, NetworkAccount, DevIssueAccount, WrappedStates, DeveloperPayment, DevProposalAccount, Tx, AppReceiptData } from '../@types'
import { SafeBigIntMath } from '../utils/safeBigIntMath'
import * as AccountsStorage from '../storage/accountStorage'
import { isUserAccount, isDevIssueAccount } from '../@types/accountTypeGuards'

export const validate_fields = (tx: Tx.DevProposal, response: ShardusTypes.IncomingTransactionResult): ShardusTypes.IncomingTransactionResult => {
  if (typeof tx.devIssue !== 'string') {
    response.reason = 'tx "devIssue" field must be a string.'
    return response
  }
  if (typeof tx.devProposal !== 'string') {
    response.reason = 'tx "devProposal" field must be a string.'
    return response
  }
  if (typeof tx.totalAmount !== 'bigint') {
    response.reason = 'tx "totalAmount" field must be a bigint.'
    return response
  }
  if (tx.totalAmount < 1) {
    response.reason = 'Minimum "tx totalAmount" allowed for a developer proposal is 1 token'
    return response
  }
  if (tx.totalAmount > 100000) {
    response.reason = 'Maximum "tx totalAmount" allowed for a developer proposal is 100,000 tokens'
    return response
  }
  if (_.isEmpty(tx.payments) || !Array.isArray(tx.payments)) {
    response.reason = 'tx "payments" field must be a non empty array.'
    return response
  }
  if (typeof tx.title !== 'string') {
    response.reason = 'tx "title" field must be a string.'
    return response
  }
  if (tx.title.length < 1) {
    response.reason = 'Minimum "tx title" field character count is 1'
    return response
  }
  if (tx.title.length > 100) {
    response.reason = 'Maximum "tx title" field character count is 100'
    return response
  }
  if (typeof tx.description !== 'string') {
    response.reason = 'tx "description" field must be a string.'
    return response
  }
  if (tx.description.length < 1) {
    response.reason = 'Minimum "tx description" field character count is 1'
    return response
  }
  if (tx.description.length > 1000) {
    response.reason = 'Maximum "tx description" field character count is 1000'
    return response
  }
  if (utils.isValidAddress(tx.payAddress) === false) {
    response.reason = 'tx "payAddress" is not a valid address.'
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
  tx: Tx.DevProposal,
  wrappedStates: WrappedStates,
  response: ShardusTypes.IncomingTransactionResult,
  dapp: Shardus,
): ShardusTypes.IncomingTransactionResult => {
  const from: UserAccount = wrappedStates[tx.from] && wrappedStates[tx.from].data
  const network: NetworkAccount = wrappedStates[config.networkAccount].data
  const devIssue: DevIssueAccount = wrappedStates[tx.devIssue] && wrappedStates[tx.devIssue].data
  if (from && !isUserAccount(from)) {
    response.reason = 'from account is not a UserAccount'
    return response
  }
  if (!devIssue) {
    response.reason = "devIssue doesn't exist"
    return response
  }
  if (!isDevIssueAccount(devIssue)) {
    response.reason = 'devIssue account is not a DevIssueAccount'
    return response
  }
  if (devIssue.number !== network.devIssue) {
    response.reason = `This dev issue number ${devIssue.number} does not match the current network dev issue ${network.devIssue}`
    return response
  }
  if (devIssue.active === false) {
    response.reason = 'This devIssue is no longer active'
    return response
  }
  if (tx.devProposal !== crypto.hash(`dev-issue-${network.devIssue}-dev-proposal-${devIssue.devProposalCount + 1}`)) {
    response.reason = 'Must give the next devIssue devProposalCount hash'
    return response
  }
  if (from.data.balance < network.current.devProposalFee + utils.getTransactionFeeWei(AccountsStorage.cachedNetworkAccount)) {
    response.reason = 'From account has insufficient balance to submit a devProposal'
    return response
  }
  if (tx.timestamp < network.devWindows.devProposalWindow[0] || tx.timestamp > network.devWindows.devProposalWindow[1]) {
    response.reason = 'Network is not within the time window to accept developer proposals'
    return response
  }
  if (tx.payments.reduce<number>((acc: number, payment: DeveloperPayment) => new Decimal(Number(payment.amount)).plus(acc) as any, 0) > 1) {
    response.reason = 'tx payment amounts added up to more than 100%'
    return response
  }
  response.success = true
  response.reason = 'This transaction is valid!'
  return response
}

export const apply = (
  tx: Tx.DevProposal,
  txTimestamp: number,
  txId: string,
  wrappedStates: WrappedStates,
  dapp: Shardus,
  applyResponse: ShardusTypes.ApplyResponse,
): void => {
  const from: UserAccount = wrappedStates[tx.from].data
  const network: NetworkAccount = wrappedStates[config.networkAccount].data
  const devIssue: DevIssueAccount = wrappedStates[tx.devIssue].data
  const devProposal: DevProposalAccount = wrappedStates[tx.devProposal].data

  from.data.balance = SafeBigIntMath.subtract(from.data.balance, network.current.devProposalFee)
  from.data.balance = SafeBigIntMath.subtract(from.data.balance, utils.getTransactionFeeWei(AccountsStorage.cachedNetworkAccount))
  from.data.balance = SafeBigIntMath.subtract(from.data.balance, utils.maintenanceAmount(txTimestamp, from, network))

  devProposal.totalAmount = tx.totalAmount
  devProposal.payAddress = tx.payAddress
  devProposal.title = tx.title
  devProposal.description = tx.description
  devProposal.payments = tx.payments
  devIssue.devProposalCount++
  devProposal.number = devIssue.devProposalCount
  devIssue.devProposals.push(devProposal.id)

  // from.data.transactions.push({ ...tx, txId })
  from.timestamp = txTimestamp
  devIssue.timestamp = txTimestamp
  devProposal.timestamp = txTimestamp

  const appReceiptData: AppReceiptData = {
    txId,
    timestamp: txTimestamp,
    success: true,
    from: tx.from,
    // the actual txTo seems to be two accounts ( devIssue and devProposal )
    // to: ,
    type: tx.type,
    transactionFee: BigInt(0),
  }
  const appReceiptDataHash = crypto.hashObj(appReceiptData)
  dapp.applyResponseAddReceiptData(applyResponse, appReceiptData, appReceiptDataHash)
  dapp.log('Applied dev_proposal tx', from, devIssue, devProposal)
}

export const createFailedAppReceiptData = (
  tx: Tx.DevProposal,
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
    // the actual txTo seems to be two accounts ( devIssue and devProposal )
    // to: tx.devIssue,
    type: tx.type,
    transactionFee: BigInt(0),
  }
  const appReceiptDataHash = crypto.hashObj(appReceiptData)
  dapp.applyResponseAddReceiptData(applyResponse, appReceiptData, appReceiptDataHash)
}

export const keys = (tx: Tx.DevProposal, result: ShardusTypes.TransactionKeys): ShardusTypes.TransactionKeys => {
  result.sourceKeys = [tx.from]
  result.targetKeys = [tx.devIssue, tx.devProposal, config.networkAccount]
  result.allKeys = [...result.sourceKeys, ...result.targetKeys]
  return result
}

export const memoryPattern = (tx: Tx.DevProposal, result: ShardusTypes.TransactionKeys): ShardusTypes.ShardusMemoryPatternsInput => {
  return {
    rw: [tx.from, tx.devProposal, tx.devIssue],
    wo: [],
    on: [],
    ri: [],
    ro: [config.networkAccount],
  }
}

export const createRelevantAccount = (
  dapp: Shardus,
  account: UserAccount | DevProposalAccount,
  accountId: string,
  tx: Tx.DevProposal,
  accountCreated = false,
): ShardusTypes.WrappedResponse => {
  if (!account) {
    if (accountId === tx.devProposal) {
      account = create.devProposalAccount(accountId)
    } else {
      account = create.userAccount(accountId, tx.timestamp)
    }
    accountCreated = true
  }
  return dapp.createWrappedResponse(accountId, accountCreated, account.hash, account.timestamp, account)
}
