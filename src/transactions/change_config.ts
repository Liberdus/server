import { Shardus, ShardusTypes } from '@shardus/core'
import * as config from '../config'
import create from '../accounts'
import {Accounts, UserAccount, NetworkAccount, NodeAccount, WrappedStates, OurAppDefinedData, Tx, TransactionKeys } from '../@types'

export const validate_fields = (tx: Tx.ChangeConfig, response: ShardusTypes.IncomingTransactionResult) => {
  if (typeof tx.from !== 'string') {
    response.success = false
    response.reason = 'tx "from" field must be a string'
    throw new Error(response.reason)
  }
  if (typeof tx.cycle !== 'number') {
    response.success = false
    response.reason = 'tx "cycle" field must be a number'
    throw new Error(response.reason)
  }
  if (typeof tx.config !== 'string') {
    response.success = false
    response.reason = 'tx "config" field must be a string'
    throw new Error(response.reason)
  }
  return response
}

export const validate = (tx: Tx.ChangeConfig, wrappedStates: WrappedStates, response: ShardusTypes.IncomingTransactionResult, dapp: Shardus) => {
  const network: NetworkAccount = wrappedStates[config.networkAccount].data

  if (network.id !== config.networkAccount) {
    response.reason = 'To account must be the network account'
    return response
  }
  try {
    let parsed = JSON.parse(tx.config)
    dapp.log(parsed)
    console.log(parsed)
  } catch (err) {
    dapp.log(err.message)
    response.reason = err.message
  }
  response.success = true
  response.reason = 'This transaction is valid!'
  return response
}

export const apply = (tx: Tx.ChangeConfig, txTimestamp: number, txId: string, wrappedStates: WrappedStates, dapp, applyResponse: ShardusTypes.ApplyResponse) => {
  const from: UserAccount = wrappedStates[tx.from].data
  const network: NetworkAccount = wrappedStates[config.networkAccount].data
  let changeOnCycle
  let cycleData: ShardusTypes.Cycle

  if (tx.cycle === -1) {
    ;[cycleData] = dapp.getLatestCycles()
    changeOnCycle = cycleData.counter + 3
  } else {
    changeOnCycle = tx.cycle
  }

  const when = txTimestamp + config.ONE_SECOND * 10
  let value = {
    type: 'apply_change_config',
    timestamp: when,
    network: config.networkAccount,
    change: { cycle: changeOnCycle, change: JSON.parse(tx.config) },
  }

  let ourAppDefinedData = applyResponse.appDefinedData as OurAppDefinedData
  ourAppDefinedData.globalMsg = { address: config.networkAccount, value, when, source: config.networkAccount }

  from.timestamp = tx.timestamp
  dapp.log('Applied change_config tx')
}

export const transactionReceiptPass = (tx: Tx.ChangeConfig, txId: string, wrappedStates: WrappedStates, dapp, applyResponse) => {
  let { address, value, when, source } = applyResponse.appDefinedData.globalMsg
  dapp.setGlobal(address, value, when, source)
  dapp.log('PostApplied change_config tx')
}

export const keys = (tx: Tx.ChangeConfig, result: TransactionKeys) => {
  result.sourceKeys = [tx.from]
  result.targetKeys = [config.networkAccount]
  result.allKeys = [...result.sourceKeys, ...result.targetKeys]
  return result
}

export const createRelevantAccount = (dapp: Shardus, account: NodeAccount, accountId: string, tx: Tx.ChangeConfig, accountCreated = false) => {
  if (!account) {
    account = create.nodeAccount(accountId)
    accountCreated = true
  }
  return dapp.createWrappedResponse(accountId, accountCreated, account.hash, account.timestamp, account)
}
