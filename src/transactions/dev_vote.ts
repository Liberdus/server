import * as crypto from 'shardus-crypto-utils'
import Shardus from 'shardus-global-server/src/shardus/shardus-types'
import * as utils from '../utils'

export const validate_fields = (tx: Tx.DevVote, response: Shardus.IncomingTransactionResult) => {
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
  if (typeof tx.approve !== 'boolean') {
    response.success = false
    response.reason = '"approve" must be a boolean.'
    throw new Error(response.reason)
  }
  if (typeof tx.devProposal !== 'string') {
    response.success = false
    response.reason = '"devProposal" must be a string.'
    throw new Error(response.reason)
  }
  if (typeof tx.devIssue !== 'string') {
    response.success = false
    response.reason = '"devIssue" must be a string.'
    throw new Error(response.reason)
  }
  // if (tx.timestamp < network.devWindows.devVotingWindow[0] || tx.timestamp > network.devWindows.devVotingWindow[1]) {
  //   response.success = false
  //   response.reason = 'Network is not currently accepting dev votes'
  //   throw new Error(response.reason)
  // }
  return response
}

export const validate = (tx: Tx.DevVote, wrappedStates: WrappedStates, response: Shardus.IncomingTransactionResult, dapp: Shardus) => {
  const from: Accounts = wrappedStates[tx.from] && wrappedStates[tx.from].data
  const network: NetworkAccount = wrappedStates[tx.network].data
  const devProposal: DevProposalAccount = wrappedStates[tx.devProposal] && wrappedStates[tx.devProposal].data
  const devIssue: DevIssueAccount = wrappedStates[tx.devIssue] && wrappedStates[tx.devIssue].data

  if (tx.sign.owner !== tx.from) {
    response.reason = 'not signed by from account'
    return response
  }
  if (crypto.verifyObj(tx) === false) {
    response.reason = 'incorrect signing'
    return response
  }
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
  if (tx.amount <= 0) {
    response.reason = 'Must send tokens in order to vote'
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

export const apply = (tx: Tx.DevVote, txId: string, wrappedStates: WrappedStates, dapp: Shardus) => {
  const from: UserAccount = wrappedStates[tx.from].data
  const network: NetworkAccount = wrappedStates[tx.network].data
  const devProposal: DevProposalAccount = wrappedStates[tx.devProposal].data

  from.data.balance -= tx.amount
  from.data.balance -= network.current.transactionFee
  from.data.balance -= utils.maintenanceAmount(tx.timestamp, from, network)

  if (tx.approve) {
    devProposal.approve += tx.amount
  } else {
    devProposal.reject += tx.amount
  }

  devProposal.totalVotes++
  from.data.transactions.push({ ...tx, txId })
  from.timestamp = tx.timestamp
  devProposal.timestamp = tx.timestamp
  dapp.log('Applied dev_vote tx', from, devProposal)
}

export const keys = (tx: Tx.DevVote, result: TransactionKeys) => {
  result.sourceKeys = [tx.from]
  result.targetKeys = [tx.devIssue, tx.devProposal, tx.network]
  result.allKeys = [...result.sourceKeys, ...result.targetKeys]
  return result
}
