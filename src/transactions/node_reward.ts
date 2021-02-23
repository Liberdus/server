import Shardus from 'shardus-global-server/src/shardus/shardus-types'
import create from '../accounts'

export const validate_fields = (tx: Tx.NodeReward, response: Shardus.IncomingTransactionResult) => {
  if (typeof tx.from !== 'string') {
    response.success = false
    response.reason = '"From" must be a string'
    throw new Error(response.reason)
  }
  if (typeof tx.nodeId !== 'string') {
    response.success = false
    response.reason = '"nodeId" must be a string'
    throw new Error(response.reason)
  }
  if (typeof tx.to !== 'string') {
    response.success = false
    response.reason = '"To" must be a string'
    throw new Error(response.reason)
  }
  return response
}

export const validate = (tx: Tx.NodeReward, wrappedStates: WrappedStates, response: Shardus.IncomingTransactionResult, dapp: Shardus) => {
  const from: Accounts = wrappedStates[tx.from] && wrappedStates[tx.from].data
  const network: NetworkAccount = wrappedStates[tx.network].data
  let nodeInfo
  try {
    nodeInfo = dapp.getNode(tx.nodeId)
  } catch (err) {
    dapp.log(err)
  }
  if (!nodeInfo) {
    response.reason = 'no nodeInfo'
    return response
  }
  if (tx.timestamp - nodeInfo.activeTimestamp < network.current.nodeRewardInterval) {
    response.reason = 'Too early for this node to get a reward'
    return response
  }
  if (!from) {
    response.success = true
    response.reason = 'This transaction in valid'
    return response
  }
  if (from) {
    if (!from.nodeRewardTime) {
      response.success = true
      response.reason = 'This transaction in valid'
      return response
    }
    if (tx.timestamp - from.nodeRewardTime < network.current.nodeRewardInterval) {
      response.reason = 'Too early for this node to get paid'
      return response
    }
  }
  response.success = true
  response.reason = 'This transaction is valid!'
  return response
}

export const apply = (tx: Tx.NodeReward, txId: string, wrappedStates: WrappedStates, dapp: Shardus) => {
  const from: NodeAccount = wrappedStates[tx.from].data
  const to: UserAccount = wrappedStates[tx.to].data
  const network: NetworkAccount = wrappedStates[tx.network].data
  //const nodeAccount: NodeAccount = to
  from.balance += network.current.nodeRewardAmount
  dapp.log(`Reward from ${tx.from} to ${tx.to}`)
  if (tx.from !== tx.to) {
    dapp.log('Node reward to and from are different.')
    dapp.log('TO ACCOUNT', to.data)
    if (to.data.stake >= network.current.stakeRequired) {
      to.data.balance += from.balance
      if (to.data.remove_stake_request) to.data.remove_stake_request = null
      from.balance = 0
      to.timestamp = tx.timestamp
    }
  }
  from.nodeRewardTime = tx.timestamp
  from.timestamp = tx.timestamp
  //NodeAccount does not have transactions
  //to.data.transactions.push({ ...tx, txId })
  dapp.log('Applied node_reward tx', from, to)
}

export const keys = (tx: Tx.NodeReward, result: TransactionKeys) => {
  result.sourceKeys = [tx.from]
  result.targetKeys = [tx.to, tx.network]
  result.allKeys = [...result.sourceKeys, ...result.targetKeys]
  return result
}

export const createRelevantAccount = (dapp: Shardus, account: NodeAccount | UserAccount, accountId: string, tx: Tx.NodeReward, accountCreated = false) => {
  if (!account) {
    if (accountId === tx.nodeId) {
      account = create.nodeAccount(accountId)
    } else {
      account = create.userAccount(accountId, tx.timestamp)
    }
    accountCreated = true
  }
  return dapp.createWrappedResponse(accountId, accountCreated, account.hash, account.timestamp, account)
}