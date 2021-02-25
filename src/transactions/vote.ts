import * as crypto from 'shardus-crypto-utils'
import Shardus from 'shardus-global-server/src/shardus/shardus-types'
import * as utils from '../utils'
import create from '../accounts'

export const validate_fields = (tx: Tx.Vote, response: Shardus.IncomingTransactionResult) => {
  if (typeof tx.from !== 'string') {
    response.success = false
    response.reason = '"From" must be a string.'
    throw new Error(response.reason)
  }
  if (typeof tx.amount !== 'number') {
    response.success = false
    response.reason = '"amount" must be a number.'
    throw new Error(response.reason)
  }
  if (tx.amount < 1) {
    response.success = false
    response.reason = 'Minimum voting "amount" allowed is 1 token'
    throw new Error(response.reason)
  }
  if (typeof tx.issue !== 'string') {
    response.success = false
    response.reason = '"issue" must be a string.'
    throw new Error(response.reason)
  }
  if (typeof tx.proposal !== 'string') {
    response.success = false
    response.reason = '"Proposal" must be a string.'
    throw new Error(response.reason)
  }
  // if (tx.timestamp < network.windows.votingWindow[0] || tx.timestamp > network.windows.votingWindow[1]) {
  //   success = false
  //   reason = 'Network is not currently accepting votes'
  //   throw new Error(reason)
  // }
  return response
}

export const validate = (tx: Tx.Vote, wrappedStates: WrappedStates, response: Shardus.IncomingTransactionResult, dapp: Shardus) => {
  const from: Accounts = wrappedStates[tx.from] && wrappedStates[tx.from].data
  const network: NetworkAccount = wrappedStates[tx.network].data
  const proposal: ProposalAccount = wrappedStates[tx.proposal] && wrappedStates[tx.proposal].data
  const issue: IssueAccount = wrappedStates[tx.issue] && wrappedStates[tx.issue].data

  if (tx.sign.owner !== tx.from) {
    response.reason = 'not signed by from account'
    return response
  }
  if (crypto.verifyObj(tx) === false) {
    response.reason = 'incorrect signing'
    return response
  }
  if (!issue) {
    response.reason = "issue doesn't exist"
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
  if (tx.amount <= 0) {
    response.reason = 'Must send tokens to vote'
    return response
  }
  if (from.data.balance < tx.amount + network.current.transactionFee) {
    response.reason = 'From account has insufficient balance to cover the amount sent in the transaction'
    return response
  }
  response.success = true
  response.reason = 'This transaction is valid!'
  return response
}

export const apply = (tx: Tx.Vote, txId: string, wrappedStates: WrappedStates, dapp: Shardus) => {
  const from: UserAccount = wrappedStates[tx.from].data
  const network: NetworkAccount = wrappedStates[tx.network].data
  const proposal: ProposalAccount = wrappedStates[tx.proposal].data
  from.data.balance -= tx.amount
  from.data.balance -= network.current.transactionFee
  from.data.balance -= utils.maintenanceAmount(tx.timestamp, from, network)
  proposal.power += tx.amount
  proposal.totalVotes++

  from.data.transactions.push({ ...tx, txId })
  from.timestamp = tx.timestamp
  proposal.timestamp = tx.timestamp
  dapp.log('Applied vote tx', from, proposal)
}

export const keys = (tx: Tx.Vote, result: TransactionKeys) => {
  result.sourceKeys = [tx.from]
  result.targetKeys = [tx.issue, tx.proposal, tx.network]
  result.allKeys = [...result.sourceKeys, ...result.targetKeys]
  return result
}

export const createRelevantAccount = (dapp: Shardus, account: UserAccount, accountId: string, tx: Tx.RemoveStake, accountCreated = false) => {
  if (!account) {
    account = create.userAccount(accountId, tx.timestamp)
    accountCreated = true
  }
  return dapp.createWrappedResponse(accountId, accountCreated, account.hash, account.timestamp, account)
}