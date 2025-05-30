import { DevSecurityLevel, Shardus, ShardusTypes } from '@shardeum-foundation/core'
import config, { networkAccount, ONE_SECOND } from '../config'
import { NetworkAccount, TXTypes, OurAppDefinedData, Signature, TransactionKeys, Tx, UserAccount, WrappedStates, AppReceiptData } from '../@types'
import { Utils } from '@shardus/types'
import * as utils from '../utils'
import * as crypto from '../crypto'

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
    const parsed = Utils.safeJsonParse(tx.config)
    dapp.log('validate_fields Tx.ChangeConfig: ', parsed)
  } catch (err) {
    response.success = false
    response.reason = 'tx "change_config" field must be a valid JSON string'
    throw new Error(response.reason)
  }
  if (!tx.signs) {
    response.success = false
    response.reason = 'No signature array found'
    throw new Error(response.reason)
  }

  const allowedPublicKeys = dapp.getMultisigPublicKeys()
  const requiredSigs = Math.max(1, config.server.debug.minMultiSigRequiredForGlobalTxs)

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

  // Validate parsed config
  const givenConfig = Utils.safeJsonParse(tx.config)
  if (
    utils.comparePropertiesTypes(utils.omitDevKeys(givenConfig), dapp.config) &&
    utils.isValidDevKeyAddition(givenConfig) &&
    utils.isValidMultisigKeyAddition(givenConfig)
  ) {
    dapp.log('Valid config', givenConfig)
  } else {
    response.success = false
    response.reason = 'Invalid server config'
    dapp.log('Invalid config', givenConfig)
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
  tx: Tx.ChangeConfig,
  txTimestamp: number,
  txId: string,
  wrappedStates: WrappedStates,
  dapp: Shardus,
  applyResponse: ShardusTypes.ApplyResponse,
): void => {
  const from: UserAccount = wrappedStates[tx.from].data
  const network: NetworkAccount = wrappedStates[networkAccount].data
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

  const when = txTimestamp + ONE_SECOND * 10
  const value = {
    type: TXTypes.apply_change_config,
    timestamp: when,
    from: tx.from,
    change: { cycle: changeOnCycle, change: Utils.safeJsonParse(tx.config) },
  } as Tx.ApplyChangeConfig

  const addressHash = wrappedStates[networkAccount].stateId
  const ourAppDefinedData = applyResponse.appDefinedData as OurAppDefinedData

  ourAppDefinedData.globalMsg = { address: networkAccount, addressHash, value, when, source: from.id }

  from.timestamp = tx.timestamp

  const appReceiptData: AppReceiptData = {
    txId,
    timestamp: txTimestamp,
    success: true,
    from: tx.from,
    to: networkAccount,
    type: tx.type,
    transactionFee: BigInt(0),
  }
  const appReceiptDataHash = crypto.hashObj(appReceiptData)
  dapp.applyResponseAddReceiptData(applyResponse, appReceiptData, appReceiptDataHash)
  dapp.log(`Applied change_config tx: ${txId}, value: ${Utils.safeStringify(value)}`)
}

export const transactionReceiptPass = (tx: Tx.ChangeConfig, txId: string, wrappedStates: WrappedStates, dapp, applyResponse) => {
  const { address, addressHash, value, when, source } = applyResponse.appDefinedData.globalMsg
  dapp.setGlobal(address, addressHash, value, when, source)
  dapp.log(`PostApplied change_config tx transactionReceiptPass: ${Utils.safeStringify({ address, addressHash, value, when, source })}`)
}

export const keys = (tx: Tx.ChangeConfig, result: TransactionKeys) => {
  result.sourceKeys = [tx.from]
  result.targetKeys = [networkAccount]
  result.allKeys = [...result.sourceKeys, ...result.targetKeys]
  return result
}

export const memoryPattern = (tx: Tx.ChangeConfig, result: TransactionKeys): ShardusTypes.ShardusMemoryPatternsInput => {
  return {
    rw: [tx.from],
    wo: [],
    on: [],
    ri: [],
    ro: [networkAccount],
  }
}

export const createRelevantAccount = (dapp: Shardus, account: UserAccount, accountId: string, tx: Tx.ChangeConfig, accountCreated = false) => {
  if (!account) {
    throw Error('Account must exist in order to perform a change_config transaction')
  }
  return dapp.createWrappedResponse(accountId, accountCreated, account.hash, account.timestamp, account)
}
