import * as crypto from 'shardus-crypto-utils'
import _ from 'lodash'
import Shardus from 'shardus-global-server/src/shardus/shardus-types'

export const validate_fields = (tx: Tx.DevIssue, response: Shardus.IncomingTransactionResult) => {
  return response
}

export const validate = (tx: Tx.DevIssue, wrappedStates: WrappedStates, response: Shardus.IncomingTransactionResult, dapp: Shardus) => {
  const network: NetworkAccount = wrappedStates[tx.network].data
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
    response.reason = `devIssue hash (${tx.devIssue}) does not match current network devIssue (${networkDevIssueHash})`
    return response
  }
  response.success = true
  response.reason = 'This transaction is valid!'
  return response
}

export const apply = (tx: Tx.DevIssue, txId: string, wrappedStates: WrappedStates, dapp: Shardus) => {
  const from: UserAccount = wrappedStates[tx.from].data
  const network: NetworkAccount = wrappedStates[tx.network].data
  const devIssue: DevIssueAccount = wrappedStates[tx.devIssue].data

  devIssue.number = network.devIssue
  devIssue.active = true

  from.timestamp = tx.timestamp
  devIssue.timestamp = tx.timestamp
  dapp.log('Applied dev_issue tx', devIssue)
}

export const keys = (tx: Tx.DevIssue, result: TransactionKeys) => {
  result.sourceKeys = [tx.from]
  result.targetKeys = [tx.devIssue, tx.network]
  result.allKeys = [...result.sourceKeys, ...result.targetKeys]
  return result
}
