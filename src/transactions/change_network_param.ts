import { Shardus, ShardusTypes } from '@shardus/core'
import * as config from '../config'
import { UserAccount, NetworkAccount, WrappedStates, OurAppDefinedData, Tx, TransactionKeys } from '../@types'
import { TXTypes } from '.'
import { Utils } from '@shardus/types'

export const validate_fields = (tx: Tx.ChangeNetworkParam, response: ShardusTypes.IncomingTransactionResult) => {
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
  try {
    const parsedNetworkParam = JSON.parse(tx.config)
    console.log('validate_fields Tx.ChangeNetworkParam: ', parsedNetworkParam)
  } catch (err) {
    response.success = false
    response.reason = 'tx "change_network_param" field must be a valid JSON string'
    console.log('validate_fields tx "change_network_param" field must be a valid JSON string', err)
    throw new Error(response.reason)
  }
  return response
}

export const validate = (tx: Tx.ChangeNetworkParam, wrappedStates: WrappedStates, response: ShardusTypes.IncomingTransactionResult, dapp: Shardus) => {
  const parsedNetworkParam = JSON.parse(tx.config)
  dapp.log('Tx.ChangeNetworkParam: ', parsedNetworkParam)
  // [TODO] Validate parsed n
  response.success = true
  response.reason = 'This transaction is valid!'
  return response
}

export const apply = (
  tx: Tx.ChangeNetworkParam,
  txTimestamp: number,
  txId: string,
  wrappedStates: WrappedStates,
  dapp,
  applyResponse: ShardusTypes.ApplyResponse,
) => {
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
    type: TXTypes.apply_change_network_param,
    timestamp: when,
    network: config.networkAccount,
    change: { cycle: changeOnCycle, change: {}, appData: Utils.safeJsonParse(tx.config) },
  }

  let ourAppDefinedData = applyResponse.appDefinedData as OurAppDefinedData
  ourAppDefinedData.globalMsg = { address: config.networkAccount, value, when, source: config.networkAccount }

  from.timestamp = tx.timestamp
  dapp.log('Applied change_network_param tx')
}

export const transactionReceiptPass = (tx: Tx.ChangeNetworkParam, txId: string, wrappedStates: WrappedStates, dapp, applyResponse) => {
  let { address, value, when, source } = applyResponse.appDefinedData.globalMsg
  dapp.setGlobal(address, value, when, source)
  dapp.log('PostApplied change_network_param tx')
}

export const keys = (tx: Tx.ChangeNetworkParam, result: TransactionKeys) => {
  result.sourceKeys = [tx.from]
  result.targetKeys = [config.networkAccount]
  result.allKeys = [...result.sourceKeys, ...result.targetKeys]
  return result
}

export const createRelevantAccount = (dapp: Shardus, account: UserAccount, accountId: string, tx: Tx.ChangeNetworkParam, accountCreated = false) => {
  if (!account) {
    throw Error('Account must exist in order to perform a change_network_param transaction')
  }
  return dapp.createWrappedResponse(accountId, accountCreated, account.hash, account.timestamp, account)
}
