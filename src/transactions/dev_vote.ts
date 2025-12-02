import * as crypto from '../crypto'
import { Shardus, ShardusTypes } from '@shardeum-foundation/core'
import * as utils from '../utils'
import * as config from '../config'
import { Accounts, UserAccount, NetworkAccount, DevProposalAccount, DevIssueAccount, WrappedStates, Tx, AppReceiptData } from '../@types'
import { SafeBigIntMath } from '../utils/safeBigIntMath'
import * as AccountsStorage from '../storage/accountStorage'

export const validate_fields = (tx: Tx.DevVote, response: ShardusTypes.IncomingTransactionResult): ShardusTypes.IncomingTransactionResult => {
  if (utils.isValidAddress(tx.from) === false) {
    response.reason = 'tx "from" is not a valid address.'
    return response
  }
  if (typeof tx.amount !== 'bigint') {
    response.reason = 'ts "amount" field must be a bigint.'
    return response
  }
  if (tx.amount < BigInt(1)) {
    response.reason = 'Minimum voting "amount" allowed is 1 token'
    return response
  }
  if (typeof tx.approve !== 'boolean') {
    response.reason = 'tx "approve" field must be a boolean.'
    return response
  }
  if (typeof tx.devProposal !== 'string') {
    response.reason = 'tx "devProposal" field must be a string.'
    return response
  }
  if (typeof tx.devIssue !== 'string') {
    response.reason = 'tx "devIssue" field must be a string.'
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
  tx: Tx.DevVote,
  wrappedStates: WrappedStates,
  response: ShardusTypes.IncomingTransactionResult,
  dapp: Shardus,
): ShardusTypes.IncomingTransactionResult => {
  const from: Accounts = wrappedStates[tx.from] && wrappedStates[tx.from].data
  const network: NetworkAccount = wrappedStates[config.networkAccount].data
  const devProposal: DevProposalAccount = wrappedStates[tx.devProposal] && wrappedStates[tx.devProposal].data
  const devIssue: DevIssueAccount = wrappedStates[tx.devIssue] && wrappedStates[tx.devIssue].data
  if (!devProposal) {
    response.reason = "devProposal doesn't exist"
    return response
  }
  if (!devIssue) {
    response.reason = "devIssue doesn't exist"
    return response
  }
  if (devIssue.number !== network.devIssue) {
    response.reason = `This devIssue number ${devIssue.number} does not match the current network devIssue ${network.issue}`
    return response
  }
  if (devIssue.active === false) {
    response.reason = 'devIssue no longer active'
    return response
  }
  if (typeof tx.amount !== 'bigint' || tx.amount <= BigInt(0)) {
    response.reason = 'Must send tokens in order to vote'
    return response
  }
  if (from.data.balance < tx.amount + utils.getTransactionFeeWei(AccountsStorage.cachedNetworkAccount)) {
    response.reason = 'From account has insufficient balance to cover the amount sent in the transaction'
    return response
  }
  if (tx.timestamp < network.devWindows.devVotingWindow[0] || tx.timestamp > network.devWindows.devVotingWindow[1]) {
    response.reason = 'Network is not within the time window to accept votes for developer proposals'
    return response
  }
  response.success = true
  response.reason = 'This transaction is valid!'
  return response
}

export const apply = (
  tx: Tx.DevVote,
  txTimestamp: number,
  txId: string,
  wrappedStates: WrappedStates,
  dapp: Shardus,
  applyResponse: ShardusTypes.ApplyResponse,
): void => {
  const from: UserAccount = wrappedStates[tx.from].data
  const network: NetworkAccount = wrappedStates[config.networkAccount].data
  const devProposal: DevProposalAccount = wrappedStates[tx.devProposal].data

  from.data.balance = SafeBigIntMath.add(from.data.balance, tx.amount)
  from.data.balance = SafeBigIntMath.add(from.data.balance, utils.getTransactionFeeWei(AccountsStorage.cachedNetworkAccount))
  from.data.balance = SafeBigIntMath.add(from.data.balance, utils.maintenanceAmount(txTimestamp, from, network))

  if (tx.approve) {
    devProposal.approve = SafeBigIntMath.add(devProposal.approve, tx.amount)
  } else {
    devProposal.reject = SafeBigIntMath.add(devProposal.reject, tx.amount)
  }

  devProposal.totalVotes++
  // from.data.transactions.push({ ...tx, txId })
  from.timestamp = txTimestamp
  devProposal.timestamp = txTimestamp

  const appReceiptData: AppReceiptData = {
    txId,
    timestamp: txTimestamp,
    success: true,
    from: tx.from,
    to: tx.devProposal,
    type: tx.type,
    transactionFee: BigInt(0),
  }
  const appReceiptDataHash = crypto.hashObj(appReceiptData)
  dapp.applyResponseAddReceiptData(applyResponse, appReceiptData, appReceiptDataHash)
  dapp.log('Applied dev_vote tx', from, devProposal)
}

export const createFailedAppReceiptData = (
  tx: Tx.DevVote,
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
    to: tx.devProposal,
    type: tx.type,
    transactionFee: BigInt(0),
  }
  const appReceiptDataHash = crypto.hashObj(appReceiptData)
  dapp.applyResponseAddReceiptData(applyResponse, appReceiptData, appReceiptDataHash)
}

export const keys = (tx: Tx.DevVote, result: ShardusTypes.TransactionKeys): ShardusTypes.TransactionKeys => {
  result.sourceKeys = [tx.from]
  result.targetKeys = [tx.devIssue, tx.devProposal, config.networkAccount]
  result.allKeys = [...result.sourceKeys, ...result.targetKeys]
  return result
}

export const memoryPattern = (tx: Tx.DevVote, result: ShardusTypes.TransactionKeys): ShardusTypes.ShardusMemoryPatternsInput => {
  return {
    rw: [tx.from, ...tx.devProposal, tx.devIssue],
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
  tx: Tx.DevVote,
  accountCreated = false,
): ShardusTypes.WrappedResponse => {
  if (!account) {
    if (accountId === tx.devProposal) {
      throw Error('Dev Proposal Account must already exist for the dev_vote transaction')
    } else {
      throw Error('Account must already exist for the dev_vote transaction')
    }
  }
  return dapp.createWrappedResponse(accountId, accountCreated, account.hash, account.timestamp, account)
}
