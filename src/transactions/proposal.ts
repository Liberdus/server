import * as crypto from 'shardus-crypto-utils'
import Shardus from 'shardus-global-server/src/shardus/shardus-types'
import * as utils from '../utils'
import create from '../accounts'

export const validate_fields = (tx: Tx.Proposal, response: Shardus.IncomingTransactionResult) => {
  if (typeof tx.from !== 'string') {
    response.success = false
    response.reason = '"From" must be a string.'
    throw new Error(response.reason)
  }
  if (typeof tx.proposal !== 'string') {
    response.success = false
    response.reason = '"Proposal" must be a string.'
    throw new Error(response.reason)
  }
  if (typeof tx.issue !== 'string') {
    response.success = false
    response.reason = '"Issue" must be a string.'
    throw new Error(response.reason)
  }
  if (typeof tx.parameters !== 'object') {
    response.success = false
    response.reason = '"Parameters" must be an object.'
    throw new Error(response.reason)
  }
  return response
}

export const validate = (tx: Tx.Proposal, wrappedStates: WrappedStates, response: Shardus.IncomingTransactionResult, dapp: Shardus) => {
  const from: Accounts = wrappedStates[tx.from] && wrappedStates[tx.from].data
  const network: NetworkAccount = wrappedStates[tx.network].data
  const issue: IssueAccount = wrappedStates[tx.issue] && wrappedStates[tx.issue].data
  const parameters: NetworkParameters = tx.parameters
  if (tx.sign.owner !== tx.from) {
    response.reason = 'not signed by from account'
    return response
  }
  if (crypto.verifyObj(tx) === false) {
    response.reason = 'incorrect signing'
    return response
  }
  if (!issue) {
    response.reason = "Issue doesn't exist"
    return response
  }
  if (issue.number !== network.issue) {
    response.reason = `This issue number ${issue.number} does not match the current network issue ${network.issue}`
    return response
  }
  if (issue.active === false) {
    response.reason = 'This issue is no longer active'
    return response
  }
  if (tx.proposal !== crypto.hash(`issue-${network.issue}-proposal-${issue.proposalCount + 1}`)) {
    response.reason = 'Must give the next issue proposalCount hash'
    return response
  }
  if (from.data.balance < network.current.proposalFee + network.current.transactionFee) {
    response.reason = 'From account has insufficient balance to submit a proposal'
    return response
  }
  if (parameters.transactionFee < 0) {
    response.reason = 'Min transaction fee permitted is 0'
    return response
  }
  if (parameters.transactionFee > 10) {
    response.reason = 'Max transaction fee permitted is 10'
    return response
  }
  if (parameters.maintenanceFee > 0.1) {
    response.reason = 'Max maintenanceFee fee permitted is 10%'
    return response
  }
  if (parameters.maintenanceFee < 0) {
    response.reason = 'Min maintenanceFee fee permitted is 0%'
    return response
  }
  if (parameters.maintenanceInterval > 1000000000000) {
    response.reason = 'Max maintenanceInterval permitted is 1000000000000'
    return response
  }
  if (parameters.maintenanceInterval < 600000) {
    response.reason = 'Min maintenanceInterval permitted is 600000 (10 minutes)'
    return response
  }
  if (parameters.nodeRewardInterval < 60000) {
    response.reason = 'Min nodeRewardInterval permitted is 60000 (1 minute)'
    return response
  }
  if (parameters.nodeRewardInterval > 900000000000) {
    response.reason = 'Max nodeRewardInterval fee permitted is 900000000000'
    return response
  }
  if (parameters.nodeRewardAmount < 0) {
    response.reason = 'Min nodeRewardAmount permitted is 0 tokens'
    return response
  }
  if (parameters.nodeRewardAmount > 1000000000) {
    response.reason = 'Max nodeRewardAmount permitted is 1000000000'
    return response
  }
  if (parameters.proposalFee < 0) {
    response.reason = 'Min proposalFee permitted is 0 tokens'
    return response
  }
  if (parameters.proposalFee > 1000000000) {
    response.reason = 'Max proposalFee permitted is 1000000000 tokens'
    return response
  }
  if (parameters.devProposalFee < 0) {
    response.reason = 'Min devProposalFee permitted is 0 tokens'
    return response
  }
  if (parameters.devProposalFee > 1000000000) {
    response.reason = 'Max devProposalFee permitted is 1000000000 tokens'
    return response
  }
  response.success = true
  response.reason = 'This transaction is valid!'
  return response
}

export const apply = (tx: Tx.Proposal, txId: string, wrappedStates: WrappedStates, dapp: Shardus) => {
  const from: UserAccount = wrappedStates[tx.from].data
  const network: NetworkAccount = wrappedStates[tx.network].data
  const proposal: ProposalAccount = wrappedStates[tx.proposal].data
  const issue: IssueAccount = wrappedStates[tx.issue].data

  from.data.balance -= network.current.proposalFee
  from.data.balance -= network.current.transactionFee
  from.data.balance -= utils.maintenanceAmount(tx.timestamp, from, network)

  proposal.parameters = tx.parameters
  issue.proposalCount++
  proposal.number = issue.proposalCount
  issue.proposals.push(proposal.id)

  from.data.transactions.push({ ...tx, txId })
  from.timestamp = tx.timestamp
  issue.timestamp = tx.timestamp
  proposal.timestamp = tx.timestamp
  dapp.log('Applied proposal tx', from, issue, proposal)
}

export const keys = (tx: Tx.Proposal, result: TransactionKeys) => {
  result.sourceKeys = [tx.from]
  result.targetKeys = [tx.issue, tx.proposal, tx.network]
  result.allKeys = [...result.sourceKeys, ...result.targetKeys]
  return result
}

export const createRelevantAccount = (dapp: Shardus, account: UserAccount | ProposalAccount, accountId: string, tx: Tx.Proposal, accountCreated = false) => {
  if (!account) {
    if (accountId === tx.proposal) {
      account = create.proposalAccount(accountId, tx.parameters)
    } else {
      account = create.userAccount(accountId, tx.timestamp)
    }
    accountCreated = true
  }
  return dapp.createWrappedResponse(accountId, accountCreated, account.hash, account.timestamp, account)
}
