import { DevSecurityLevel, Shardus, ShardusTypes } from '@shardeum-foundation/core'
import * as config from '../config'
import { AppReceiptData, NetworkAccount, OurAppDefinedData, Signature, TXTypes, TransactionKeys, Tx, UserAccount, WrappedStates } from '../@types'
import { Utils } from '@shardus/types'
import * as utils from '../utils'
import * as crypto from '../crypto'

export const validate_fields = (tx: Tx.ChangeNetworkParam, response: ShardusTypes.IncomingTransactionResult, dapp: Shardus) => {
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
    dapp.log('validate_fields Tx.ChangeNetworkParam: ', parsedNetworkParam)
  } catch (err) {
    response.success = false
    response.reason = 'tx "change_network_param" field must be a valid JSON string'
    console.log('validate_fields tx "change_network_param" field must be a valid JSON string', err)
    throw new Error(response.reason)
  }
  if (!tx.signs || (tx.signs instanceof Array && tx.signs.length === 0)) {
    response.success = false
    response.reason = 'No signature array found'
    throw new Error(response.reason)
  }

  const allowedPublicKeys = dapp.getMultisigPublicKeys()
  const requiredSigs = Math.max(1, dapp.config.debug.minMultiSigRequiredForGlobalTxs)

  const sigs: Signature[] = Object.assign([], tx.signs)
  const txWithoutSign = { ...tx }
  delete txWithoutSign.signs

  const sigsAreValid = utils.verifyMultiSigs(txWithoutSign, sigs, allowedPublicKeys, requiredSigs, DevSecurityLevel.High)
  if (!sigsAreValid) {
    response.success = false
    response.reason = 'Invalid signatures'
    throw new Error(response.reason)
  }
  return response
}

export const validate = (tx: Tx.ChangeNetworkParam, wrappedStates: WrappedStates, response: ShardusTypes.IncomingTransactionResult, dapp: Shardus) => {
  const parsedNetworkParam = JSON.parse(tx.config)
  const network: NetworkAccount = wrappedStates[config.networkAccount].data
  dapp.log('Tx.ChangeNetworkParam: ', parsedNetworkParam)

  // Validate parsed network params
  const givenNetworkParams = Utils.safeJsonParse(tx.config)
  if (utils.comparePropertiesTypes(givenNetworkParams, network.current)) {
    dapp.log('Valid network parameters', givenNetworkParams)
  } else {
    response.success = false
    response.reason = 'Invalid network parameters'
    dapp.log('Invalid network parameters', givenNetworkParams)
    return response
  }

  const allowedPublicKeys = dapp.getMultisigPublicKeys()
  const requiredSigs = Math.max(1, dapp.config.debug.minMultiSigRequiredForGlobalTxs)

  const sigs: Signature[] = tx.signs instanceof Array ? tx.signs : [tx.signs]
  const txWithoutSign = { ...tx }
  delete txWithoutSign.signs

  const sigsAreValid = utils.verifyMultiSigs(txWithoutSign, sigs, allowedPublicKeys, requiredSigs, DevSecurityLevel.High)
  if (!sigsAreValid) {
    response.success = false
    response.reason = 'Invalid signatures'
    return response
  }
  response.success = true
  response.reason = 'This transaction is valid!'
  return response
}

export const apply = (
  tx: Tx.ChangeNetworkParam,
  txTimestamp: number,
  txId: string,
  wrappedStates: WrappedStates,
  dapp: Shardus,
  applyResponse: ShardusTypes.ApplyResponse,
): void => {
  const from: UserAccount = wrappedStates[tx.from].data
  let changeOnCycle
  let cycleData: ShardusTypes.Cycle

  if (tx.cycle === -1) {
    ;[cycleData] = dapp.getLatestCycles()
    changeOnCycle = cycleData.counter + 3
  } else {
    changeOnCycle = tx.cycle
  }

  const when = txTimestamp + config.ONE_SECOND * 10
  const value = {
    type: TXTypes.apply_change_network_param,
    timestamp: when,
    // network: config.networkAccount,
    change: { cycle: changeOnCycle, change: {}, appData: Utils.safeJsonParse(tx.config) },
  }

  const addressHash = wrappedStates[config.networkAccount].stateId
  const ourAppDefinedData = applyResponse.appDefinedData as OurAppDefinedData
  ourAppDefinedData.globalMsg = { address: config.networkAccount, addressHash, value, when, source: from.id }

  from.timestamp = tx.timestamp

  const appReceiptData: AppReceiptData = {
    txId,
    timestamp: txTimestamp,
    success: true,
    from: tx.from,
    to: config.networkAccount,
    type: tx.type,
    transactionFee: BigInt(0),
  }
  const appReceiptDataHash = crypto.hashObj(appReceiptData)
  dapp.applyResponseAddReceiptData(applyResponse, appReceiptData, appReceiptDataHash)
  dapp.log(`Applied change_network_param tx: ${txId}, value: ${Utils.safeStringify(value)}`)
}

export const transactionReceiptPass = (tx: Tx.ChangeNetworkParam, txId: string, wrappedStates: WrappedStates, dapp, applyResponse) => {
  const { address, addressHash, value, when, source } = applyResponse.appDefinedData.globalMsg
  dapp.setGlobal(address, addressHash, value, when, source)
  dapp.log(`PostApplied change_network_param tx transactionReceiptPass: ${Utils.safeStringify({ address, addressHash, value, when, source })}`)
}

export const keys = (tx: Tx.ChangeNetworkParam, result: TransactionKeys) => {
  result.sourceKeys = [tx.from]
  result.targetKeys = [config.networkAccount]
  result.allKeys = [...result.sourceKeys, ...result.targetKeys]
  return result
}

export const memoryPattern = (tx: Tx.ChangeNetworkParam, result: TransactionKeys): ShardusTypes.ShardusMemoryPatternsInput => {
  return {
    rw: [tx.from],
    wo: [],
    on: [],
    ri: [],
    ro: [config.networkAccount],
  }
}

export const createRelevantAccount = (dapp: Shardus, account: UserAccount, accountId: string, tx: Tx.ChangeNetworkParam, accountCreated = false) => {
  if (!account) {
    throw Error('Account must exist in order to perform a change_network_param transaction')
  }
  return dapp.createWrappedResponse(accountId, accountCreated, account.hash, account.timestamp, account)
}
