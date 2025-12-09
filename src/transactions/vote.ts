import * as crypto from '../crypto'
import { Shardus, ShardusTypes } from '@shardus/core'
import * as utils from '../utils'
import { UserAccount, IssueAccount, WrappedStates, ProposalAccount, Tx, AppReceiptData } from '../@types'
import { SafeBigIntMath } from '../utils/safeBigIntMath'
import * as AccountsStorage from '../storage/accountStorage'
import { isUserAccount, isIssueAccount, isProposalAccount } from '../@types/accountTypeGuards'

export const validate_fields = (tx: Tx.Vote, response: ShardusTypes.IncomingTransactionResult): ShardusTypes.IncomingTransactionResult => {
  if (utils.isValidAddress(tx.from) === false) {
    response.reason = 'tx "from" is not a valid address.'
    return response
  }
  if (typeof tx.amount !== 'bigint') {
    response.reason = 'tx "amount" field must be a bigint.'
    return response
  }
  if (tx.amount < BigInt(1)) {
    response.reason = 'Minimum voting "amount" allowed is 1 token'
    return response
  }
  if (typeof tx.issue !== 'string') {
    response.reason = 'tx "issue" field must be a string.'
    return response
  }
  if (typeof tx.proposal !== 'string') {
    response.reason = 'tx "proposal" field must be a string.'
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
  tx: Tx.Vote,
  wrappedStates: WrappedStates,
  response: ShardusTypes.IncomingTransactionResult,
  dapp: Shardus,
): ShardusTypes.IncomingTransactionResult => {
  const from: UserAccount = wrappedStates[tx.from] && wrappedStates[tx.from].data
  const proposal: ProposalAccount = wrappedStates[tx.proposal] && wrappedStates[tx.proposal].data
  const issue: IssueAccount = wrappedStates[tx.issue] && wrappedStates[tx.issue].data
  const network = AccountsStorage.cachedNetworkAccount

  if (from && !isUserAccount(from)) {
    response.reason = 'from account is not a UserAccount'
    return response
  }
  if (!issue) {
    response.reason = "issue doesn't exist"
    return response
  }
  if (!isIssueAccount(issue)) {
    response.reason = 'issue account is not an IssueAccount'
    return response
  }
  if (issue.number !== network.issue) {
    response.reason = `This issue number ${issue.number} does not match the current network issue ${network.issue}`
    return response
  }
  if (issue.active === false) {
    response.reason = 'issue no longer active'
    return response
  }
  if (!proposal) {
    response.reason = "Proposal doesn't exist"
    return response
  }
  if (!isProposalAccount(proposal)) {
    response.reason = 'proposal account is not a ProposalAccount'
    return response
  }
  if (tx.amount <= 0) {
    response.reason = 'Must send tokens to vote'
    return response
  }
  if (from.data.balance < tx.amount + utils.getTransactionFeeWei(AccountsStorage.cachedNetworkAccount)) {
    response.reason = 'From account has insufficient balance to cover the amount sent in the transaction'
    return response
  }
  if (tx.timestamp < network.windows.votingWindow[0] || tx.timestamp > network.windows.votingWindow[1]) {
    response.reason = 'Network is not within the time window to accept votes'
    return response
  }
  response.success = true
  response.reason = 'This transaction is valid!'
  return response
}

export const apply = (
  tx: Tx.Vote,
  txTimestamp: number,
  txId: string,
  wrappedStates: WrappedStates,
  dapp: Shardus,
  applyResponse: ShardusTypes.ApplyResponse,
): void => {
  const from: UserAccount = wrappedStates[tx.from].data
  const proposal: ProposalAccount = wrappedStates[tx.proposal].data
  const network = AccountsStorage.cachedNetworkAccount
  from.data.balance = SafeBigIntMath.subtract(from.data.balance, tx.amount)
  const transactionFee = utils.getTransactionFeeWei(AccountsStorage.cachedNetworkAccount)
  const maintenanceFee = utils.maintenanceAmount(txTimestamp, from, network)
  from.data.balance = SafeBigIntMath.subtract(from.data.balance, transactionFee)
  from.data.balance = SafeBigIntMath.subtract(from.data.balance, maintenanceFee)
  proposal.power += Number(tx.amount)
  proposal.totalVotes++

  // from.data.transactions.push({ ...tx, txId })
  from.timestamp = txTimestamp
  proposal.timestamp = txTimestamp

  const appReceiptData: AppReceiptData = {
    txId,
    timestamp: txTimestamp,
    success: true,
    from: tx.from,
    to: tx.proposal,
    type: tx.type,
    transactionFee,
    additionalInfo: {
      maintenanceFee,
    },
  }
  const appReceiptDataHash = crypto.hashObj(appReceiptData)
  dapp.applyResponseAddReceiptData(applyResponse, appReceiptData, appReceiptDataHash)
  dapp.log('Applied vote tx', from, proposal)
}

export const createFailedAppReceiptData = (
  tx: Tx.Vote,
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
    to: tx.proposal,
    type: tx.type,
    transactionFee: BigInt(0),
  }
  const appReceiptDataHash = crypto.hashObj(appReceiptData)
  dapp.applyResponseAddReceiptData(applyResponse, appReceiptData, appReceiptDataHash)
}

export const keys = (tx: Tx.Vote, result: ShardusTypes.TransactionKeys): ShardusTypes.TransactionKeys => {
  result.sourceKeys = [tx.from]
  result.targetKeys = [tx.issue, tx.proposal]
  result.allKeys = [...result.sourceKeys, ...result.targetKeys]
  return result
}

export const memoryPattern = (tx: Tx.Vote, result: ShardusTypes.TransactionKeys): ShardusTypes.ShardusMemoryPatternsInput => {
  const memoryPattern: ShardusTypes.ShardusMemoryPatternsInput = {
    rw: [tx.from, tx.proposal, tx.issue],
    wo: [],
    on: [],
    ri: [],
    ro: [],
  }
  return memoryPattern
}

export const createRelevantAccount = (
  dapp: Shardus,
  account: UserAccount,
  accountId: string,
  tx: Tx.Vote,
  accountCreated = false,
): ShardusTypes.WrappedResponse => {
  if (!account) {
    throw new Error('Account must already exist for the vote transaction')
  }
  return dapp.createWrappedResponse(accountId, accountCreated, account.hash, account.timestamp, account)
}
