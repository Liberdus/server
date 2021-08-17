import * as crypto from 'shardus-crypto-utils'
import _ from 'lodash'
import { Shardus, ShardusTypes } from 'shardus-global-server'
import create from '../accounts'
import * as config from '../config'

export const validate_fields = (tx: Tx.DevIssue, response: ShardusTypes.IncomingTransactionResult) => {
  if (typeof tx.nodeId !== 'string') {
    response.success = false
    response.reason = 'tx "nodeId" field must be a string.'
    throw new Error(response.reason)
  }
  if (typeof tx.from !== 'string') {
    response.success = false
    response.reason = 'tx "from" field must be a string.'
    throw new Error(response.reason)
  }
  if (typeof tx.devIssue !== 'string') {
    response.success = false
    response.reason = 'tx "devIssue" field must be a string.'
    throw new Error(response.reason)
  }
  return response
}

export const validate = (tx: Tx.DevIssue, wrappedStates: WrappedStates, response: ShardusTypes.IncomingTransactionResult, dapp: Shardus) => {
  const network: NetworkAccount = wrappedStates[config.networkAccount].data
  const devIssue: DevIssueAccount = wrappedStates[tx.devIssue] && wrappedStates[tx.devIssue].data
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
  if (devIssue.active !== null) {
    response.reason = 'devIssue is already active'
    return response
  }
  const networkDevIssueHash = crypto.hash(`dev-issue-${network.devIssue}`)
  if (tx.devIssue !== networkDevIssueHash) {
    response.reason = `devIssue address (${tx.devIssue}) does not match current network devIssue address (${networkDevIssueHash})`
    return response
  }
  if (tx.timestamp < network.devWindows.devProposalWindow[0] || tx.timestamp > network.devWindows.devProposalWindow[1]) {
    response.reason = 'Network is not within the time window to generate developer proposal issues'
    return response
  }
  response.success = true
  response.reason = 'This transaction is valid!'
  return response
}

export const apply = (tx: Tx.DevIssue, txId: string, wrappedStates: WrappedStates, dapp: Shardus) => {
  const from: UserAccount = wrappedStates[tx.from].data
  const network: NetworkAccount = wrappedStates[config.networkAccount].data
  const devIssue: DevIssueAccount = wrappedStates[tx.devIssue].data

  devIssue.number = network.devIssue
  devIssue.active = true

  from.timestamp = tx.timestamp
  devIssue.timestamp = tx.timestamp
  dapp.log('Applied dev_issue tx', devIssue)
}

export const keys = (tx: Tx.DevIssue, result: TransactionKeys) => {
  result.sourceKeys = [tx.from]
  result.targetKeys = [tx.devIssue, config.networkAccount]
  result.allKeys = [...result.sourceKeys, ...result.targetKeys]
  return result
}

export const createRelevantAccount = (dapp: Shardus, account: NodeAccount | DevIssueAccount, accountId: string, tx: Tx.DevIssue, accountCreated = false) => {
  if (!account) {
    if (accountId === tx.devIssue) {
      account = create.devIssueAccount(accountId)
    } else {
      account = create.nodeAccount(accountId)
    }
    accountCreated = true
  }
  return dapp.createWrappedResponse(accountId, accountCreated, account.hash, account.timestamp, account)
}
