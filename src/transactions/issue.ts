import * as crypto from 'shardus-crypto-utils'
import _ from 'lodash'
import Shardus from 'shardus-global-server/src/shardus/shardus-types'
import create from '../accounts'
import * as config from '../config'

export const validate_fields = (tx: Tx.Issue, response: Shardus.IncomingTransactionResult) => {
  if (typeof tx.network !== 'string') {
    response.success = false
    response.reason = 'tx "network" field must be a string.'
    throw new Error(response.reason)
  }
  if (tx.network !== config.networkAccount) {
    response.success = false
    response.reason = 'tx "network" field must be: ' + config.networkAccount
    throw new Error(response.reason)
  }
  if (typeof tx.nodeId !== 'string') {
    response.success = false
    response.reason = 'tx "nodeId" field must be a string.'
    throw new Error(response.reason)
  }
  if (typeof tx.from !== 'string') {
    response.success = false
    response.reason = 'tx "from field must be a string.'
    throw new Error(response.reason)
  }
  if (typeof tx.issue !== 'string') {
    response.success = false
    response.reason = 'tx "issue" field must be a string.'
    throw new Error(response.reason)
  }
  if (typeof tx.proposal !== 'string') {
    response.success = false
    response.reason = 'tx "proposal" field must be a string.'
    throw new Error(response.reason)
  }
  return response
}

export const validate = (tx: Tx.Issue, wrappedStates: WrappedStates, response: Shardus.IncomingTransactionResult, dapp: Shardus) => {
  const network: NetworkAccount = wrappedStates[tx.network].data
  const issue: IssueAccount = wrappedStates[tx.issue] && wrappedStates[tx.issue].data
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
  if (issue.active !== null) {
    response.reason = 'Issue is already active'
    return response
  }

  const networkIssueHash = crypto.hash(`issue-${network.issue}`)
  if (tx.issue !== networkIssueHash) {
    response.reason = `issue hash (${tx.issue}) does not match current network issue hash (${networkIssueHash}) --- networkAccount: ${JSON.stringify(network)}`
    return response
  }
  const networkProposalHash = crypto.hash(`issue-${network.issue}-proposal-1`)
  if (tx.proposal !== networkProposalHash) {
    response.reason = `proposalHash (${
      tx.proposal
    }) does not match the current default network proposal (${networkProposalHash}) --- networkAccount: ${JSON.stringify(network)}`
    return response
  }
  if (tx.timestamp < network.windows.proposalWindow[0] || tx.timestamp > network.windows.proposalWindow[1]) {
    response.reason = 'Network is not within the time window to generate issues'
    return response
  }
  response.success = true
  response.reason = 'This transaction is valid!'
  return response
}

export const apply = (tx: Tx.Issue, txId: string, wrappedStates: WrappedStates, dapp: Shardus) => {
  const from: UserAccount = wrappedStates[tx.from].data
  const network: NetworkAccount = wrappedStates[tx.network].data
  const issue: IssueAccount = wrappedStates[tx.issue].data
  const proposal: ProposalAccount = wrappedStates[tx.proposal].data

  proposal.parameters = _.cloneDeep(network.current)
  proposal.parameters.title = 'Default parameters'
  proposal.parameters.description = 'Keep the current network parameters as they are'
  proposal.number = 1

  issue.number = network.issue
  issue.active = true
  issue.proposals.push(proposal.id)
  issue.proposalCount++

  from.timestamp = tx.timestamp
  issue.timestamp = tx.timestamp
  proposal.timestamp = tx.timestamp
  dapp.log('Applied issue tx', issue, proposal)
}

export const keys = (tx: Tx.Issue, result: TransactionKeys) => {
  result.sourceKeys = [tx.from]
  result.targetKeys = [tx.issue, tx.proposal, tx.network]
  result.allKeys = [...result.sourceKeys, ...result.targetKeys]
  return result
}

export const createRelevantAccount = (
  dapp: Shardus,
  account: NodeAccount | IssueAccount | ProposalAccount,
  accountId: string,
  tx: Tx.Issue,
  accountCreated = false,
) => {
  if (!account) {
    if (accountId === tx.issue) {
      account = create.issueAccount(accountId)
    } else if (accountId === tx.proposal) {
      account = create.proposalAccount(accountId)
    } else {
      account = create.nodeAccount(accountId)
    }
    accountCreated = true
  }
  return dapp.createWrappedResponse(accountId, accountCreated, account.hash, account.timestamp, account)
}
