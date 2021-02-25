import Shardus from 'shardus-global-server/src/shardus/shardus-types'
import * as config from '../config'
import create from '../accounts'

export const validate_fields = (tx: Tx.DevParameters, response: Shardus.IncomingTransactionResult) => {
  return response
}

export const validate = (tx: Tx.DevParameters, wrappedStates: WrappedStates, response: Shardus.IncomingTransactionResult, dapp: Shardus) => {
  const network: NetworkAccount = wrappedStates[tx.network].data
  const devIssue: DevIssueAccount = wrappedStates[tx.devIssue].data

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
  if (!devIssue) {
    response.reason = "devIssue doesn't exist"
    return response
  }
  if (devIssue.number !== network.devIssue) {
    response.reason = `This devIssue number ${devIssue.number} does not match the current network issue ${network.devIssue}`
    return response
  }
  if (devIssue.active === false) {
    response.reason = 'This devIssue is no longer active'
    return response
  }
  response.success = true
  response.reason = 'This transaction is valid!'
  return response
}

export const apply = (tx: Tx.DevParameters, txId: string, wrappedStates: WrappedStates, dapp) => {
  const from: UserAccount = wrappedStates[tx.from].data
  const network: NetworkAccount = wrappedStates[tx.network].data
  const devIssue: DevIssueAccount = wrappedStates[tx.devIssue].data
  const when = tx.timestamp + config.ONE_SECOND * 10

  dapp.setGlobal(
    config.networkAccount,
    {
      type: 'apply_dev_parameters',
      timestamp: when,
      network: config.networkAccount,
      devWindows: network.nextDevWindows,
      nextDevWindows: {},
      developerFund: [...network.developerFund, ...network.nextDeveloperFund].sort((a, b) => a.timestamp - b.timestamp),
      nextDeveloperFund: [],
      devIssue: network.devIssue + 1,
    },
    when,
    config.networkAccount,
  )

  devIssue.active = false

  from.timestamp = tx.timestamp
  devIssue.timestamp = tx.timestamp
  dapp.log('Applied dev_parameters tx', from, devIssue)
}

export const keys = (tx: Tx.DevParameters, result: TransactionKeys) => {
  result.sourceKeys = [tx.from]
  result.targetKeys = [tx.devIssue, tx.network]
  result.allKeys = [...result.sourceKeys, ...result.targetKeys]
  return result
}

export const createRelevantAccount = (dapp: Shardus, account: NodeAccount, accountId: string, tx: Tx.DevParameters, accountCreated = false) => {
  if (!account) {
    account = create.nodeAccount(accountId)
    accountCreated = true
  }
  return dapp.createWrappedResponse(accountId, accountCreated, account.hash, account.timestamp, account)
}