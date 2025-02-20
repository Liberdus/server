import * as crypto from '../crypto'
import _ from 'lodash'
import { Shardus, ShardusTypes } from '@shardus/core'
import create from '../accounts'
import * as config from '../config'
import { NodeAccount, UserAccount, NetworkAccount, IssueAccount, WrappedStates, ProposalAccount, Tx, TransactionKeys, AppReceiptData } from '../@types'
import { Utils } from '@shardus/types'

export const validate_fields = (tx: Tx.Issue, response: ShardusTypes.IncomingTransactionResult) => {
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

export const validate = (tx: Tx.Issue, wrappedStates: WrappedStates, response: ShardusTypes.IncomingTransactionResult, dapp: Shardus) => {
  const network: NetworkAccount = wrappedStates[config.networkAccount].data
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
    response.reason = `issue hash (${tx.issue}) does not match current network issue hash (${networkIssueHash}) --- networkAccount: ${Utils.safeStringify(
      network,
    )}`
    return response
  }
  const networkProposalHash = crypto.hash(`issue-${network.issue}-proposal-1`)
  if (tx.proposal !== networkProposalHash) {
    response.reason = `proposalHash (${
      tx.proposal
    }) does not match the current default network proposal (${networkProposalHash}) --- networkAccount: ${Utils.safeStringify(network)}`
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

export const apply = (
  tx: Tx.Issue,
  txTimestamp: number,
  txId: string,
  wrappedStates: WrappedStates,
  dapp: Shardus,
  applyResponse: ShardusTypes.ApplyResponse,
): void => {
  const from: NodeAccount = wrappedStates[tx.from].data

  const network: NetworkAccount = wrappedStates[config.networkAccount].data
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

  from.timestamp = txTimestamp
  issue.timestamp = txTimestamp
  proposal.timestamp = txTimestamp

  const appReceiptData: AppReceiptData = {
    txId,
    timestamp: txTimestamp,
    success: true,
    from: tx.from,
    // the actual txTo seems to be two accounts ( issue and proposal )
    // to: ,
    type: tx.type,
    transactionFee: BigInt(0),
  }
  dapp.applyResponseAddReceiptData(applyResponse, appReceiptData, txId)
  dapp.log('Applied issue tx', issue, proposal)
}

export const keys = (tx: Tx.Issue, result: TransactionKeys) => {
  result.sourceKeys = [tx.from]
  result.targetKeys = [tx.issue, tx.proposal, config.networkAccount]
  result.allKeys = [...result.sourceKeys, ...result.targetKeys]
  return result
}

export const memoryPattern = (tx: Tx.Issue, result: TransactionKeys): ShardusTypes.ShardusMemoryPatternsInput => {
  return {
    rw: [tx.from, tx.issue, tx.proposal],
    wo: [],
    on: [],
    ri: [],
    ro: [config.networkAccount],
  }
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
