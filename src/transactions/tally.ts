import * as crypto from '../crypto'
import { Shardus, ShardusTypes } from '@shardeum-foundation/core'
import * as config from '../config'
import * as utils from '../utils'
import create from '../accounts'
import { NodeAccount, Windows, OurAppDefinedData, NetworkAccount, IssueAccount, WrappedStates, ProposalAccount, Tx, AppReceiptData } from '../@types'

export const validate_fields = (tx: Tx.Tally, response: ShardusTypes.IncomingTransactionResult): ShardusTypes.IncomingTransactionResult => {
  if (utils.isValidAddress(tx.nodeId) === false) {
    response.reason = 'tx "nodeId" is not a valid address.'
    return response
  }
  if (utils.isValidAddress(tx.from) === false) {
    response.reason = 'tx "from" is not a valid address.'
    return response
  }
  if (typeof tx.issue !== 'string') {
    response.reason = 'tx "issue" field must be a string.'
    return response
  }
  if (!Array.isArray(tx.proposals)) {
    response.reason = 'tx "proposals" field must be an array.'
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
  tx: Tx.Tally,
  wrappedStates: WrappedStates,
  response: ShardusTypes.IncomingTransactionResult,
  dapp: Shardus,
): ShardusTypes.IncomingTransactionResult => {
  const network: NetworkAccount = wrappedStates[config.networkAccount].data
  const issue: IssueAccount = wrappedStates[tx.issue] && wrappedStates[tx.issue].data
  const proposals: ProposalAccount[] = tx.proposals.map((id: string) => wrappedStates[id].data)

  // let nodeInfo
  // try {
  //   nodeInfo = dapp.getNode(tx.nodeId)
  // } catch (err) {
  //   dapp.log(err)
  // }
  // if (!nodeInfo) {
  //   response.reason = 'no nodeInfo'
  //   return response
  // }
  if (network.id !== config.networkAccount) {
    response.reason = 'To account must be the network account'
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
  if (issue.winnerId !== null) {
    response.reason = 'The winner for this issue has already been determined'
    return response
  }
  if (proposals.length !== issue.proposalCount) {
    response.reason = 'The number of proposals sent in with the transaction doesnt match the issues proposalCount'
    return response
  }
  if (tx.timestamp < network.windows.graceWindow[0] || tx.timestamp > network.windows.graceWindow[1]) {
    response.reason = 'Network is not within the time window to tally votes for proposals'
    return response
  }
  response.success = true
  response.reason = 'This transaction is valid!'
  return response
}

export const apply = (
  tx: Tx.Tally,
  txTimestamp: number,
  txId: string,
  wrappedStates: WrappedStates,
  dapp: Shardus,
  applyResponse: ShardusTypes.ApplyResponse,
): void => {
  const from: NodeAccount = wrappedStates[tx.from].data
  const network: NetworkAccount = wrappedStates[config.networkAccount].data
  const issue: IssueAccount = wrappedStates[tx.issue].data
  const margin = 100 / (2 * (issue.proposalCount + 1)) / 100

  const defaultProposal: ProposalAccount = wrappedStates[crypto.hash(`issue-${issue.number}-proposal-1`)].data
  const sortedProposals: ProposalAccount[] = tx.proposals
    .map((id: string) => wrappedStates[id].data)
    .sort((a: ProposalAccount, b: ProposalAccount) => b.power - a.power)
  let winner = defaultProposal

  for (const proposal of sortedProposals) {
    proposal.winner = false
  }

  if (sortedProposals.length >= 2) {
    const firstPlace = sortedProposals[0]
    const secondPlace = sortedProposals[1]
    const marginToWin = secondPlace.power + margin * secondPlace.power
    if (firstPlace.power >= marginToWin) {
      winner = firstPlace
    }
  }

  winner.winner = true // CHICKEN DINNER
  const next = winner.parameters
  const nextWindows: Windows = {
    proposalWindow: [network.windows.applyWindow[1], network.windows.applyWindow[1] + config.TIME_FOR_PROPOSALS],
    votingWindow: [
      network.windows.applyWindow[1] + config.TIME_FOR_PROPOSALS,
      network.windows.applyWindow[1] + config.TIME_FOR_PROPOSALS + config.TIME_FOR_VOTING,
    ],
    graceWindow: [
      network.windows.applyWindow[1] + config.TIME_FOR_PROPOSALS + config.TIME_FOR_VOTING,
      network.windows.applyWindow[1] + config.TIME_FOR_PROPOSALS + config.TIME_FOR_VOTING + config.TIME_FOR_GRACE,
    ],
    applyWindow: [
      network.windows.applyWindow[1] + config.TIME_FOR_PROPOSALS + config.TIME_FOR_VOTING + config.TIME_FOR_GRACE,
      network.windows.applyWindow[1] + config.TIME_FOR_PROPOSALS + config.TIME_FOR_VOTING + config.TIME_FOR_GRACE + config.TIME_FOR_APPLY,
    ],
  }

  const when = txTimestamp + config.ONE_SECOND * 10
  const value = {
    type: 'apply_tally',
    timestamp: when,
    networkId: config.networkAccount,
    next,
    nextWindows,
  } as Tx.ApplyTally

  const addressHash = wrappedStates[config.networkAccount].stateId
  const ourAppDefinedData = applyResponse.appDefinedData as OurAppDefinedData
  // [TODO] - Calculate the afterStateHash if old DAO is active
  const afterStateHash = ''
  ourAppDefinedData.globalMsg = { address: config.networkAccount, addressHash, value, when, source: from.id, afterStateHash }

  issue.winnerId = winner.id
  issue.tallied = true

  from.timestamp = txTimestamp
  issue.timestamp = txTimestamp
  winner.timestamp = txTimestamp

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
  dapp.log('Applied tally tx', txId, issue, winner, ourAppDefinedData)
}

export const createFailedAppReceiptData = (
  tx: Tx.Tally,
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
  // we should be careful, "wrappedStates" is only accountWrites at this point
  const issue: IssueAccount = wrappedStates[tx.issue].data
  const winnerId = issue.winnerId
  const winnerProposal: ProposalAccount = wrappedStates[winnerId]?.data
  const winner = winnerProposal

  if (winner == null) {
    dapp.log('ERROR: No winner proposal found for issue', issue, winnerId, wrappedStates)
    return
  }

  const { address, addressHash, value, when, source, afterStateHash } = (applyResponse.appDefinedData as OurAppDefinedData).globalMsg
  dapp.setGlobal(address, addressHash, value, when, source, afterStateHash)
  dapp.log('PostApplied tally tx', issue, winner, value)
}

export const keys = (tx: Tx.Tally, result: ShardusTypes.TransactionKeys): ShardusTypes.TransactionKeys => {
  result.sourceKeys = [tx.from]
  result.targetKeys = [...tx.proposals, tx.issue, config.networkAccount]
  result.allKeys = [...result.sourceKeys, ...result.targetKeys]
  return result
}

export const memoryPattern = (tx: Tx.Tally, result: ShardusTypes.TransactionKeys): ShardusTypes.ShardusMemoryPatternsInput => {
  return {
    rw: [tx.from, tx.issue, ...tx.proposals],
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
  tx: Tx.Tally,
  accountCreated = false,
): ShardusTypes.WrappedResponse => {
  if (!account) {
    account = create.nodeAccount(accountId)
    accountCreated = true
  }
  return dapp.createWrappedResponse(accountId, accountCreated, account.hash, account.timestamp, account)
}
