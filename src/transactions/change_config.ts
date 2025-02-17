import { DevSecurityLevel, Shardus, ShardusTypes } from '@shardus/core'
import * as config from '../config'
import { NetworkAccount, OurAppDefinedData, Signature, TransactionKeys, Tx, UserAccount, WrappedStates } from '../@types'
import { TXTypes } from '.'
import { Utils } from '@shardus/types'
import * as utils from '../utils'

export const validate_fields = (tx: Tx.ChangeConfig, response: ShardusTypes.IncomingTransactionResult, dapp: Shardus) => {
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
    const parsed = JSON.parse(tx.config)
    dapp.log('validate_fields Tx.ChangeConfig: ', parsed)
  } catch (err) {
    response.success = false
    response.reason = 'tx "change_config" field must be a valid JSON string'
    dapp.log('validate_fields tx "change_config" field must be a valid JSON string', err)
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

export const validate = (tx: Tx.ChangeConfig, wrappedStates: WrappedStates, response: ShardusTypes.IncomingTransactionResult, dapp: Shardus) => {
  const parsedConfig = JSON.parse(tx.config)
  dapp.log('Tx.ChangeConfig: ', parsedConfig)
  // [TODO] Validate parsed config
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
  tx: Tx.ChangeConfig,
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

  const isValid = validate(tx, wrappedStates, { success: false, reason: '' }, dapp)
  if (!isValid.success) {
    dapp.log(`txId: ${txId} validation failed`, isValid.reason)
    from.timestamp = txTimestamp
    dapp.log('Applied change_config tx')
    return
  }

  if (tx.cycle === -1) {
    ;[cycleData] = dapp.getLatestCycles()
    changeOnCycle = cycleData.counter + 3
  } else {
    changeOnCycle = tx.cycle
  }

  const when = txTimestamp + config.ONE_SECOND * 10
  const value = {
    type: TXTypes.apply_change_config,
    timestamp: when,
    network: config.networkAccount,
    change: { cycle: changeOnCycle, change: Utils.safeJsonParse(tx.config) },
  }

  const addressHash = wrappedStates[config.networkAccount].stateId
  const ourAppDefinedData = applyResponse.appDefinedData as OurAppDefinedData

  ourAppDefinedData.globalMsg = { address: config.networkAccount, addressHash, value, when, source: from.id }

  from.timestamp = tx.timestamp
  dapp.log(`Applied change_config tx: ${txId}, value: ${Utils.safeStringify(value)}`)
}

export const transactionReceiptPass = (tx: Tx.ChangeConfig, txId: string, wrappedStates: WrappedStates, dapp, applyResponse) => {
  let { address, addressHash, value, when, source } = applyResponse.appDefinedData.globalMsg
  dapp.setGlobal(address, addressHash, value, when, source)
  dapp.log(`PostApplied change_config tx transactionReceiptPass: ${Utils.safeStringify({ address, addressHash, value, when, source })}`)
}

export const keys = (tx: Tx.ChangeConfig, result: TransactionKeys) => {
  result.sourceKeys = [tx.from]
  result.targetKeys = [config.networkAccount]
  result.allKeys = [...result.sourceKeys, ...result.targetKeys]
  return result
}

export const memoryPattern = (tx: Tx.ChangeConfig, result: TransactionKeys): ShardusTypes.ShardusMemoryPatternsInput => {
  return {
    rw: [tx.from],
    wo: [],
    on: [],
    ri: [],
    ro: [config.networkAccount],
  }
}

export const createRelevantAccount = (dapp: Shardus, account: UserAccount, accountId: string, tx: Tx.ChangeConfig, accountCreated = false) => {
  if (!account) {
    throw Error('Account must exist in order to perform a change_config transaction')
  }
  return dapp.createWrappedResponse(accountId, accountCreated, account.hash, account.timestamp, account)
}
