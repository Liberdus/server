import * as crypto from 'shardus-crypto-utils'
import Shardus from 'shardus-global-server/src/shardus/shardus-types'
import * as config from '../config'
import create from '../accounts'

export const validate_fields = (tx: Tx.Tally, response: Shardus.IncomingTransactionResult) => {
  return response
}

export const validate = (tx: Tx.Tally, wrappedStates: WrappedStates, response: Shardus.IncomingTransactionResult, dapp: Shardus) => {
  const network: NetworkAccount = wrappedStates[tx.network].data
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
  response.success = true
  response.reason = 'This transaction is valid!'
  return response
}

export const apply = (tx: Tx.Tally, txId: string, wrappedStates: WrappedStates, dapp) => {
  const from: UserAccount = wrappedStates[tx.from].data
  const network: NetworkAccount = wrappedStates[tx.network].data
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

  const when = tx.timestamp + config.ONE_SECOND * 10

  dapp.setGlobal(
    config.networkAccount,
    {
      type: 'apply_tally',
      timestamp: when,
      network: config.networkAccount,
      next,
      nextWindows,
    },
    when,
    config.networkAccount,
  )

  issue.winnerId = winner.id

  from.timestamp = tx.timestamp
  issue.timestamp = tx.timestamp
  winner.timestamp = tx.timestamp
  dapp.log('Applied tally tx', issue, winner)
}

export const keys = (tx: Tx.Tally, result: TransactionKeys) => {
  result.sourceKeys = [tx.from]
  result.targetKeys = [...tx.proposals, tx.issue, tx.network]
  result.allKeys = [...result.sourceKeys, ...result.targetKeys]
  return result
}

export const createRelevantAccount = (dapp: Shardus, account: NodeAccount, accountId: string, tx: Tx.Tally, accountCreated = false) => {
  if (!account) {
    account = create.nodeAccount(accountId)
    accountCreated = true
  }
  return dapp.createWrappedResponse(accountId, accountCreated, account.hash, account.timestamp, account)
}