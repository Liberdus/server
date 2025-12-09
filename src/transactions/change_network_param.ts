import { DevSecurityLevel, Shardus, ShardusTypes } from '@shardus/core'
import * as config from '../config'
import { AppReceiptData, DevAccount, NetworkAccount, OurAppDefinedData, Signature, TXTypes, Tx, UserAccount, WrappedStates } from '../@types'
import { Utils } from '@shardus/lib-types'
import * as utils from '../utils'
import * as crypto from '../crypto'
import * as AccountsStorage from '../storage/accountStorage'
import { isDevAccount, isNetworkAccount } from '../@types/accountTypeGuards'

export const validate_fields = (
  tx: Tx.ChangeNetworkParam,
  response: ShardusTypes.IncomingTransactionResult,
  dapp: Shardus,
): ShardusTypes.IncomingTransactionResult => {
  if (utils.isValidAddress(tx.from) === false) {
    response.reason = 'tx "from" is not a valid address.'
    return response
  }
  if (typeof tx.cycle !== 'number') {
    response.reason = 'tx "cycle" field must be a number'
    return response
  }
  if (typeof tx.config !== 'string') {
    response.reason = 'tx "config" field must be a string'
    return response
  }
  try {
    const parsedNetworkParam = JSON.parse(tx.config)
    dapp.log('validate_fields Tx.ChangeNetworkParam: ', parsedNetworkParam)
  } catch (err) {
    response.reason = 'tx "change_network_param" field must be a valid JSON string'
    console.log('validate_fields tx "change_network_param" field must be a valid JSON string', err)
    return response
  }
  if (!tx.signs || (tx.signs instanceof Array && tx.signs.length === 0)) {
    response.reason = 'No signature array found'
    return response
  }

  const allowedPublicKeys = dapp.getMultisigPublicKeys()
  const requiredSigs = Math.max(1, dapp.config.debug.minMultiSigRequiredForGlobalTxs)

  const sigs: Signature[] = Object.assign([], tx.signs)
  const txWithoutSign = { ...tx }
  delete txWithoutSign.signs

  const sigsAreValid = utils.verifyMultiSigs(txWithoutSign, sigs, allowedPublicKeys, requiredSigs, DevSecurityLevel.High)
  if (!sigsAreValid) {
    response.reason = 'Invalid signatures'
    return response
  }

  response.success = true
  return response
}

export const validate = (
  tx: Tx.ChangeNetworkParam,
  wrappedStates: WrappedStates,
  response: ShardusTypes.IncomingTransactionResult,
  dapp: Shardus,
): ShardusTypes.IncomingTransactionResult => {
  const parsedNetworkParam = JSON.parse(tx.config)
  const from: DevAccount = wrappedStates[tx.from].data
  const network: NetworkAccount = wrappedStates[config.networkAccount].data
  dapp.log('Tx.ChangeNetworkParam: ', parsedNetworkParam)

  if (!isDevAccount(from)) {
    response.reason = 'from account is not a DevAccount'
    return response
  }

  if (!isNetworkAccount(network)) {
    response.reason = 'network account is not a NetworkAccount'
    return response
  }

  // Validate parsed network params
  const givenNetworkParams = Utils.safeJsonParse(tx.config)
  if (utils.comparePropertiesTypes(givenNetworkParams, network.current)) {
    dapp.log('Valid network parameters', givenNetworkParams)
  } else {
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
  const from: DevAccount = wrappedStates[tx.from].data
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
    networkId: AccountsStorage.cachedNetworkAccount.networkId,
    timestamp: when,
    from: tx.from,
    change: { cycle: changeOnCycle, change: {}, appData: Utils.safeJsonParse(tx.config) },
  } as Tx.ApplyChangeNetworkParam

  const addressHash = wrappedStates[config.networkAccount].stateId

  // Calculate the hash of the network account after the change has been applied, so we can pass afterStateHash to global message
  const network = wrappedStates[config.networkAccount].data
  // Create a deep copy of the network account
  const clonedNetworkAccount = utils.deepCopy(network)
  clonedNetworkAccount.listOfChanges.push(value.change)
  clonedNetworkAccount.timestamp = when
  const afterStateHash = utils.calculateAccountHash(clonedNetworkAccount)

  const ourAppDefinedData = applyResponse.appDefinedData as OurAppDefinedData
  ourAppDefinedData.globalMsg = { address: config.networkAccount, addressHash, value, when, source: from.id, afterStateHash }

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

export const createFailedAppReceiptData = (
  tx: Tx.ChangeNetworkParam,
  txTimestamp: number,
  txId: string,
  wrappedStates: WrappedStates,
  dapp: Shardus,
  applyResponse: ShardusTypes.ApplyResponse,
  reason: string,
): void => {
  const appReceiptData: AppReceiptData = {
    txId,
    timestamp: txTimestamp,
    success: false,
    reason,
    from: tx.from,
    to: config.networkAccount,
    type: tx.type,
    transactionFee: BigInt(0),
  }
  const appReceiptDataHash = crypto.hashObj(appReceiptData)
  dapp.applyResponseAddReceiptData(applyResponse, appReceiptData, appReceiptDataHash)
}

export const transactionReceiptPass = (
  tx: Tx.ChangeNetworkParam,
  txId: string,
  wrappedStates: WrappedStates,
  dapp: Shardus,
  applyResponse: ShardusTypes.ApplyResponse,
): void => {
  const { address, addressHash, value, when, source, afterStateHash } = (applyResponse.appDefinedData as OurAppDefinedData).globalMsg
  dapp.setGlobal(address, addressHash, value, when, source, afterStateHash)
  dapp.log(`PostApplied change_network_param tx transactionReceiptPass: ${Utils.safeStringify({ address, addressHash, value, when, source })}`)
}

export const keys = (tx: Tx.ChangeNetworkParam, result: ShardusTypes.TransactionKeys): ShardusTypes.TransactionKeys => {
  result.sourceKeys = [tx.from]
  result.targetKeys = [config.networkAccount]
  result.allKeys = [...result.sourceKeys, ...result.targetKeys]
  return result
}

export const memoryPattern = (tx: Tx.ChangeNetworkParam, result: ShardusTypes.TransactionKeys): ShardusTypes.ShardusMemoryPatternsInput => {
  return {
    rw: [tx.from],
    wo: [],
    on: [],
    ri: [],
    ro: [config.networkAccount],
  }
}

export const createRelevantAccount = (
  dapp: Shardus,
  account: UserAccount,
  accountId: string,
  tx: Tx.ChangeNetworkParam,
  accountCreated = false,
): ShardusTypes.WrappedResponse => {
  if (!account) {
    throw Error('Account must exist in order to perform a change_network_param transaction')
  }
  return dapp.createWrappedResponse(accountId, accountCreated, account.hash, account.timestamp, account)
}
