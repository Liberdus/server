import * as crypto from 'shardus-crypto-utils'
import Shardus from 'shardus-global-server/src/shardus/shardus-types'
import * as utils from '../utils'
import create from '../accounts'

export const validate_fields = (tx: Tx.Stake, response: Shardus.IncomingTransactionResult) => {
  if (typeof tx.from !== 'string') {
    response.success = false
    response.reason = '"From" must be a string.'
    throw new Error(response.reason)
  }
  if (typeof tx.stake !== 'number') {
    response.success = false
    response.reason = '"Stake" must be a number.'
    throw new Error(response.reason)
  }
  return response
}

export const validate = (tx: Tx.Stake, wrappedStates: WrappedStates, response: Shardus.IncomingTransactionResult, dapp: Shardus) => {
  const from: Accounts = wrappedStates[tx.from] && wrappedStates[tx.from].data
  const network: NetworkAccount = wrappedStates[tx.network].data
  if (typeof from === 'undefined' || from === null) {
    response.reason = 'from account does not exist'
    return response
  }
  if (tx.sign.owner !== tx.from) {
    response.reason = 'not signed by from account'
    return response
  }
  if (crypto.verifyObj(tx) === false) {
    response.reason = 'incorrect signing'
    return response
  }
  if (from.data.balance < network.current.stakeRequired) {
    response.reason = `From account has insufficient balance, the cost required to receive node rewards is ${network.current.stakeRequired}`
    return response
  }
  if (tx.stake < network.current.stakeRequired) {
    response.reason = `Stake amount sent: ${tx.stake} is less than the cost required to operate a node: ${network.current.stakeRequired}`
    return response
  }
  response.success = true
  response.reason = 'This transaction is valid!'
  return response
}

export const apply = (tx: Tx.Stake, txId: string, wrappedStates: WrappedStates, dapp: Shardus) => {
  const from: UserAccount = wrappedStates[tx.from].data
  const network: NetworkAccount = wrappedStates[tx.network].data
  from.data.balance -= network.current.stakeRequired
  from.data.balance -= utils.maintenanceAmount(tx.timestamp, from, network)
  from.data.stake = network.current.stakeRequired
  from.timestamp = tx.timestamp
  from.data.transactions.push({ ...tx, txId })
  dapp.log('Applied stake tx', from)
}

export const keys = (tx: Tx.Stake, result: TransactionKeys) => {
  result.sourceKeys = [tx.from]
  result.targetKeys = [tx.network]
  result.allKeys = [...result.sourceKeys, ...result.targetKeys]
  return result
}

export const createRelevantAccount = (dapp: Shardus, account: UserAccount, accountId: string, tx: Tx.RemoveStake, accountCreated = false) => {
  if (!account) {
    account = create.userAccount(accountId, tx.timestamp)
    accountCreated = true
  }
  return dapp.createWrappedResponse(accountId, accountCreated, account.hash, account.timestamp, account)
}