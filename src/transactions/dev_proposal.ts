import * as crypto from 'shardus-crypto-utils'
import Shardus from 'shardus-global-server/src/shardus/shardus-types'
import Decimal from 'decimal.js'
import * as utils from '../utils'

export const validate_fields = (tx: Tx.DevProposal, response: Shardus.IncomingTransactionResult) => {
  if (typeof tx.devIssue !== 'string') {
    response.success = false
    response.reason = '"devIssue" must be a string.'
    throw new Error(response.reason)
  }
  if (typeof tx.devProposal !== 'string') {
    response.success = false
    response.reason = '"devProposal" must be a string.'
    throw new Error(response.reason)
  }
  if (typeof tx.totalAmount !== 'number') {
    response.success = false
    response.reason = '"totalAmount" must be a number.'
    throw new Error(response.reason)
  }
  if (tx.totalAmount < 1) {
    response.success = false
    response.reason = 'Minimum "totalAmount" allowed is 1 token'
    throw new Error(response.reason)
  }
  if (tx.totalAmount > 100000) {
    response.success = false
    response.reason = 'Maximum "totalAmount" allowed is 100,000 tokens'
    throw new Error(response.reason)
  }
  if (Array.isArray(tx.payments) !== true) {
    response.success = false
    response.reason = '"payments" must be an array.'
    throw new Error(response.reason)
  }
  if (typeof tx.description !== 'string') {
    response.success = false
    response.reason = '"description" must be a string.'
    throw new Error(response.reason)
  }
  if (tx.description.length < 1) {
    response.success = false
    response.reason = 'Minimum "description" character count is 1'
    throw new Error(response.reason)
  }
  if (tx.description.length > 1000) {
    response.success = false
    response.reason = 'Maximum "description" character count is 1000'
    throw new Error(response.reason)
  }
  if (typeof tx.payAddress !== 'string') {
    response.success = false
    response.reason = '"payAddress" must be a string.'
    throw new Error(response.reason)
  }
  if (tx.payAddress.length !== 64) {
    response.success = false
    response.reason = '"payAddress" length must be 64 characters (A valid public address)'
    throw new Error(response.reason)
  }
  // if (tx.timestamp < network.devWindows.devProposalWindow[0] || tx.timestamp > network.devWindows.devProposalWindow[1]) {
  //   response.success = false
  //   response.reason = 'Network is not accepting dev proposals'
  //   throw new Error(response.reason)
  // }
  return response
}

export const validate = (tx: Tx.DevProposal, wrappedStates: WrappedStates, response: Shardus.IncomingTransactionResult, dapp: Shardus) => {
  const from: Accounts = wrappedStates[tx.from] && wrappedStates[tx.from].data
  const network: NetworkAccount = wrappedStates[tx.network].data
  const devIssue: DevIssueAccount = wrappedStates[tx.devIssue] && wrappedStates[tx.devIssue].data

  if (tx.sign.owner !== tx.from) {
    response.reason = 'not signed by from account'
    return response
  }
  if (crypto.verifyObj(tx) === false) {
    response.reason = 'incorrect signing'
    return response
  }
  if (!devIssue) {
    response.reason = "devIssue doesn't exist"
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
  if (from.data.balance < network.current.devProposalFee + network.current.transactionFee) {
    response.reason = 'From account has insufficient balance to submit a devProposal'
    return response
  }
  // if (tx.payments.reduce((acc: number, payment: DeveloperPayment) => new Decimal(payment.amount).plus(acc), 0) > 1) {
  //   response.reason = 'tx payment amounts added up to more than 100%'
  //   return response
  // }
  response.success = true
  response.reason = 'This transaction is valid!'
  return response
}

export const apply = (tx: Tx.DevProposal, txId: string, wrappedStates: WrappedStates, dapp: Shardus) => {
  const from: UserAccount = wrappedStates[tx.from].data
  const network: NetworkAccount = wrappedStates[tx.network].data
  const devIssue: DevIssueAccount = wrappedStates[tx.devIssue].data
  const devProposal: DevProposalAccount = wrappedStates[tx.devProposal].data

  from.data.balance -= network.current.devProposalFee
  from.data.balance -= network.current.transactionFee
  from.data.balance -= utils.maintenanceAmount(tx.timestamp, from, network)

  devProposal.totalAmount = tx.totalAmount
  devProposal.payAddress = tx.payAddress
  devProposal.title = tx.title
  devProposal.description = tx.description
  devProposal.payments = tx.payments
  devIssue.devProposalCount++
  devProposal.number = devIssue.devProposalCount
  devIssue.devProposals.push(devProposal.id)

  from.data.transactions.push({ ...tx, txId })
  from.timestamp = tx.timestamp
  devIssue.timestamp = tx.timestamp
  devProposal.timestamp = tx.timestamp
  dapp.log('Applied dev_proposal tx', from, devIssue, devProposal)
}

export const keys = (tx: Tx.DevProposal, result: TransactionKeys) => {
  result.sourceKeys = [tx.from]
  result.targetKeys = [tx.devIssue, tx.devProposal, tx.network]
  result.allKeys = [...result.sourceKeys, ...result.targetKeys]
  return result
}
