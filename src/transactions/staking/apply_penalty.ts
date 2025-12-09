import { nestedCountersInstance, Shardus, ShardusTypes } from '@shardus/core'
import { logFlags } from '@shardus/core/dist/logger'
import { LiberdusFlags, ONE_SECOND } from '../../config'
import {
  NodeAccount,
  ViolationType,
  Tx,
  WrappedStates,
  UserAccount,
  LeftNetworkEarlyViolationData,
  NodeRefutedViolationData,
  SyncingTimeoutViolationData,
  AppReceiptData,
  TXTypes,
} from '../../@types'
import * as AccountsStorage from '../../storage/accountStorage'
import { isEqualOrNewerVersion, _sleep, generateTxId, isValidAddress, getStakeRequiredWei } from '../../utils'
import * as crypto from '../../crypto'
import { SafeBigIntMath } from '../../utils/safeBigIntMath'
import { RemoveNodeCert } from './query_certificate'
import { isNodeAccount, isUserAccount } from '../../@types/accountTypeGuards'

const penaltyTxsMap: Map<string, Tx.PenaltyTX> = new Map()

export async function injectPenaltyTX(
  dapp: Shardus,
  eventData: ShardusTypes.ShardusEvent,
  violationData: LeftNetworkEarlyViolationData | NodeRefutedViolationData | SyncingTimeoutViolationData,
): Promise<{
  success: boolean
  reason: string
  status: number
}> {
  let violationType: ViolationType
  if (eventData.type === 'node-left-early') violationType = ViolationType.LeftNetworkEarly
  else if (eventData.type === 'node-refuted') violationType = ViolationType.NodeRefuted
  else if (eventData.type === 'node-sync-timeout') violationType = ViolationType.SyncingTooLong
  const unsignedTx = {
    type: TXTypes.apply_penalty,
    reportedNodeId: eventData.nodeId,
    reportedNodePublickKey: eventData.publicKey,
    timestamp: dapp.shardusGetTime(),
    violationType,
    violationData,
    networkId: AccountsStorage.cachedNetworkAccount.networkId,
  } as Tx.PenaltyTX

  const wrapeedNodeAccount: ShardusTypes.WrappedDataFromQueue = await dapp.getLocalOrRemoteAccount(unsignedTx.reportedNodePublickKey)
  if (!wrapeedNodeAccount || !wrapeedNodeAccount.data) {
    return {
      success: false,
      reason: 'Penalty Node Account not found',
      status: 404,
    }
  }
  const nodeAccount = wrapeedNodeAccount.data as NodeAccount
  // [TODO] Check if nodeAccount is a valid node account

  if (nodeAccount.nominator === '' || nodeAccount.nominator == null) {
    return {
      success: false,
      reason: 'Nominator is not set in the node account',
      status: 404,
    }
  }
  unsignedTx.nominator = nodeAccount.nominator

  // to make sure that differnt nodes all submit an equivalent unsignedTx that is counted as the same unsignedTx,
  // we need to make sure that we have a determinstic timestamp
  const cycleEndTime = eventData.time
  let futureTimestamp = cycleEndTime * 1000
  while (futureTimestamp < dapp.shardusGetTime()) {
    futureTimestamp += 30 * 1000
  }
  unsignedTx.timestamp = futureTimestamp

  const signedTx = dapp.signAsNode(unsignedTx) as Tx.PenaltyTX
  const txId = generateTxId(unsignedTx)
  // store the unsignedTx to local map for later use
  recordPenaltyTX(txId, signedTx)

  // Limit the nodes that send this to the <LiberdusFlags.numberOfNodesToInjectPenaltyTx> closest to the node address ( publicKey )
  const closestNodes = dapp.getClosestNodes(eventData.publicKey, LiberdusFlags.numberOfNodesToInjectPenaltyTx)
  const ourId = dapp.getNodeId()
  const isLuckyNode = closestNodes.some((nodeId) => nodeId === ourId)
  if (!isLuckyNode) {
    if (LiberdusFlags.VerboseLogs) console.log(`injectPenaltyTX: not lucky node, skipping injection`, signedTx)
    return { success: false, reason: 'not lucky node', status: 404 }
  }
  const waitTime = futureTimestamp - dapp.shardusGetTime()
  // since we have to pick a future timestamp, we need to wait until it is time to submit the signedTx
  await _sleep(waitTime)

  if (LiberdusFlags.VerboseLogs) {
    console.log(`injectPenaltyTX: tx.timestamp: ${signedTx.timestamp} txid: ${txId}`, signedTx)
  }

  const result = await dapp.put(signedTx)
  if (LiberdusFlags.VerboseLogs) dapp.log('INJECTED_PENALTY_TX', result)
  return result
}

export const validate_fields = (tx: Tx.PenaltyTX, response: ShardusTypes.IncomingTransactionResult): ShardusTypes.IncomingTransactionResult => {
  if (isValidAddress(tx.reportedNodeId) === false) {
    nestedCountersInstance.countEvent('liberdus-penalty', `validatePenaltyTX fail tx.reportedNodeId address invalid`)
    if (LiberdusFlags.VerboseLogs) console.log(`validatePenaltyTX fail tx.reportedNodeId address invalid`, tx)
    response.reason = 'Invalid reportedNode ID'
    return response
  }
  if (isValidAddress(tx.reportedNodePublickKey) === false) {
    nestedCountersInstance.countEvent('liberdus-penalty', `validatePenaltyTX fail tx.reportedNode publicKey invalid`)
    if (LiberdusFlags.VerboseLogs) console.log(`validatePenaltyTX fail tx.reportedNode publicKey invalid`, tx)
    response.reason = 'Invalid reportedNode public key'
    return response
  }
  if (isValidAddress(tx.nominator) === false) {
    nestedCountersInstance.countEvent('liberdus-penalty', `validatePenaltyTX fail tx.nominator address invalid`)
    if (LiberdusFlags.VerboseLogs) console.log(`validatePenaltyTX fail tx.nominator address invalid`, tx)
    response.reason = 'Invalid nominator address'
    return response
  }
  if (tx.violationType < ViolationType.LiberdusMinID || tx.violationType > ViolationType.LiberdusMaxID) {
    nestedCountersInstance.countEvent('liberdus-penalty', `validatePenaltyTX fail tx.violationType invalid`)
    if (LiberdusFlags.VerboseLogs) console.log(`validatePenaltyTX fail tx.violationType invalid`, tx)
    response.reason = 'Invalid violation type'
    return response
  }
  if (!tx.violationData) {
    //TODO validate violation data using violation types

    nestedCountersInstance.countEvent('liberdus-penalty', `validatePenaltyTX fail tx.violationData invalid`)
    if (LiberdusFlags.VerboseLogs) console.log(`validatePenaltyTX fail tx.violationData invalid`, tx)
    response.reason = 'Invalid violation data'
    return response
  }

  if (tx.timestamp <= 0) {
    nestedCountersInstance.countEvent('liberdus-penalty', `validatePenaltyTX fail tx.timestamp invalid`)
    if (LiberdusFlags.VerboseLogs) console.log(`validatePenaltyTX fail tx.timestamp invalid`, tx)
    response.reason = 'Invalid timestamp'
    return response
  }
  if (tx.violationType === ViolationType.LeftNetworkEarly && AccountsStorage.cachedNetworkAccount.current.slashing.enableLeftNetworkEarlySlashing === false) {
    response.reason = 'Left network early slashing is disabled'
    return response
  }
  if (tx.violationType === ViolationType.SyncingTooLong && AccountsStorage.cachedNetworkAccount.current.slashing.enableSyncTimeoutSlashing === false) {
    response.reason = 'Syncing timeout slashing is disabled'
    return response
  }
  if (tx.violationType === ViolationType.NodeRefuted && AccountsStorage.cachedNetworkAccount.current.slashing.enableNodeRefutedSlashing === false) {
    response.reason = 'Node refuted slashing is disabled'
    return response
  }
  const txId = generateTxId(tx)
  // check if we have this penalty tx stored in the Map
  const preRecordedfPenaltyTX = penaltyTxsMap.get(txId)
  if (preRecordedfPenaltyTX == null) {
    response.reason = 'Penalty TX not found in penaltyTxsMap of exe node'
    return response
  }
  const isValid = crypto.verifyObj(tx, true)
  if (!isValid) {
    nestedCountersInstance.countEvent('liberdus-penalty', `validatePenaltyTX fail tx.signature invalid`)
    if (LiberdusFlags.VerboseLogs) console.log(`validatePenaltyTX fail tx.signature invalid`, tx)
    response.reason = 'Invalid signature'
    return response
  }
  if (LiberdusFlags.VerboseLogs) console.log(`validatePenaltyTX success`, tx)
  nestedCountersInstance.countEvent('liberdus-penalty', `validatePenaltyTX success`)
  response.success = true
  return response
}

export const validate = (
  tx: Tx.PenaltyTX,
  wrappedStates: WrappedStates,
  response: ShardusTypes.IncomingTransactionResult,
  dapp: Shardus,
): ShardusTypes.IncomingTransactionResult => {
  if (LiberdusFlags.VerboseLogs) console.log(`validatePenaltyTX`, tx)
  const nodeAccount = wrappedStates[tx.reportedNodePublickKey].data as NodeAccount
  const operatorAccount = wrappedStates[tx.nominator].data as UserAccount
  if (!isNodeAccount(nodeAccount)) {
    nestedCountersInstance.countEvent('liberdus-penalty', `validatePenaltyTX fail reported node address is not a NodeAccount`)
    if (LiberdusFlags.VerboseLogs) console.log(`validatePenaltyTX fail reported node address is not a NodeAccount`, tx)
    response.reason = 'reported node address is not a NodeAccount'
    return response
  }
  if (!isUserAccount(operatorAccount)) {
    nestedCountersInstance.countEvent('liberdus-penalty', `validatePenaltyTX fail operatorAccount is not a UserAccount`)
    if (LiberdusFlags.VerboseLogs) console.log(`validatePenaltyTX fail operatorAccount is not a UserAccount`, tx)
    response.reason = 'nominator account is not a UserAccount'
    return response
  }
  if (nodeAccount.nominator !== tx.nominator) {
    nestedCountersInstance.countEvent('liberdus-penalty', `validatePenaltyTX fail tx.nominator does not match`)
    if (LiberdusFlags.VerboseLogs) console.log(`validatePenaltyTX fail tx.nominator does not match`, tx)
    response.reason = 'tx.nominator does not match'
    return response
  }

  // checking if it was already penalized?
  // Compares the event timestamp of the penalty tx with the timestamp of the last saved penalty tx
  let isProcessed = false
  let eventTime = 0
  if (tx.violationType === ViolationType.LeftNetworkEarly) {
    isProcessed = nodeAccount.nodeAccountStats.lastPenaltyTime >= (tx.violationData as LeftNetworkEarlyViolationData).nodeDroppedTime
    eventTime = (tx.violationData as LeftNetworkEarlyViolationData).nodeDroppedTime
  }
  if (tx.violationType === ViolationType.NodeRefuted) {
    isProcessed = nodeAccount.nodeAccountStats.lastPenaltyTime >= (tx.violationData as NodeRefutedViolationData).nodeRefutedTime
    eventTime = (tx.violationData as NodeRefutedViolationData).nodeRefutedTime
  }
  if (tx.violationType === ViolationType.SyncingTooLong) {
    isProcessed = nodeAccount.nodeAccountStats.lastPenaltyTime >= (tx.violationData as SyncingTimeoutViolationData).nodeDroppedTime
    eventTime = (tx.violationData as SyncingTimeoutViolationData).nodeDroppedTime
  }
  if (isProcessed) {
    if (LiberdusFlags.VerboseLogs)
      dapp.log(
        `Processed penaltyTX: for reportedNode ${tx.reportedNodePublickKey}, nominator ${tx.nominator}, violationType ${tx.violationType}, eventTime ${eventTime} vs lastPenaltyTime ${nodeAccount.nodeAccountStats.lastPenaltyTime}`,
      )
    nestedCountersInstance.countEvent('liberdus-penalty', `validatePenaltyTX fail isProcessedPenaltyTx`)
    if (LiberdusFlags.VerboseLogs) console.log(`validatePenaltyTX fail isProcessedPenaltyTx`, tx)
    response.reason = 'Penalty TX already processed'
    return response
  }
  if (LiberdusFlags.VerboseLogs) console.log(`validatePenaltyTX success`, tx)
  response.success = true
  response.reason = 'This transaction is valid!'
  return response
}

export const apply = (
  tx: Tx.PenaltyTX,
  txTimestamp: number,
  txId: string,
  wrappedStates: WrappedStates,
  dapp: Shardus,
  applyResponse: ShardusTypes.ApplyResponse,
): void => {
  if (LiberdusFlags.VerboseLogs) console.log(`Running applyPenaltyTX`, tx, wrappedStates)
  /* eslint-disable security/detect-object-injection */
  const nodeAccount = wrappedStates[tx.reportedNodePublickKey].data as NodeAccount
  const operatorAccount = wrappedStates[tx.nominator].data as UserAccount

  let eventTime = 0
  if (tx.violationType === ViolationType.LeftNetworkEarly) {
    eventTime = (tx.violationData as LeftNetworkEarlyViolationData).nodeDroppedTime
  }
  if (tx.violationType === ViolationType.NodeRefuted) {
    eventTime = (tx.violationData as NodeRefutedViolationData).nodeRefutedTime
  }
  if (tx.violationType === ViolationType.SyncingTooLong) {
    eventTime = (tx.violationData as SyncingTimeoutViolationData).nodeDroppedTime
  }

  let penaltyAmount = getPenaltyForViolation(tx, nodeAccount.stakeLock)
  if (penaltyAmount > nodeAccount.stakeLock) penaltyAmount = nodeAccount.stakeLock

  // update operator account
  operatorAccount.operatorAccountInfo.stake = SafeBigIntMath.subtract(operatorAccount.operatorAccountInfo.stake, penaltyAmount)
  operatorAccount.operatorAccountInfo.operatorStats.totalNodePenalty = SafeBigIntMath.add(
    operatorAccount.operatorAccountInfo.operatorStats.totalNodePenalty,
    penaltyAmount,
  )
  operatorAccount.timestamp = txTimestamp

  // update node account
  nodeAccount.stakeLock = SafeBigIntMath.subtract(nodeAccount.stakeLock, penaltyAmount)
  nodeAccount.penalty = SafeBigIntMath.add(nodeAccount.penalty, penaltyAmount)
  nodeAccount.nodeAccountStats.totalPenalty = SafeBigIntMath.add(nodeAccount.nodeAccountStats.totalPenalty, penaltyAmount)
  nodeAccount.nodeAccountStats.penaltyHistory.push({
    type: tx.violationType,
    amount: penaltyAmount,
    timestamp: eventTime,
  })
  if (isEqualOrNewerVersion('2.4.3', AccountsStorage.cachedNetworkAccount.current.activeVersion)) {
    // prune history to last newest 10 entries
    if (nodeAccount.nodeAccountStats.penaltyHistory.length > 10) {
      nodeAccount.nodeAccountStats.penaltyHistory.splice(0, nodeAccount.nodeAccountStats.penaltyHistory.length - 100)
    }
  }
  nodeAccount.timestamp = txTimestamp
  nodeAccount.nodeAccountStats.lastPenaltyTime = eventTime

  if (LiberdusFlags.VerboseLogs) console.log(`Calculating updated node penalty. nodePenaltyAmount: ${nodeAccount.penalty}`)

  const appReceiptData: AppReceiptData = {
    txId,
    timestamp: txTimestamp,
    success: true,
    from: tx.reportedNodePublickKey,
    to: tx.nominator,
    type: tx.type,
    transactionFee: BigInt(0),
    additionalInfo: {
      penaltyAmount,
    },
  }
  const appReceiptDataHash = crypto.hashObj(appReceiptData)
  dapp.applyResponseAddReceiptData(applyResponse, appReceiptData, appReceiptDataHash)

  nestedCountersInstance.countEvent('liberdus-penalty', `Applied PenaltyTX`)
  if (LiberdusFlags.VerboseLogs) dapp.log('Applied PenaltyTX', tx.reportedNodePublickKey)
}

export const createFailedAppReceiptData = (
  tx: Tx.PenaltyTX,
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
    from: tx.reportedNodePublickKey,
    to: tx.nominator,
    type: tx.type,
    transactionFee: BigInt(0),
  }
  const appReceiptDataHash = crypto.hashObj(appReceiptData)
  dapp.applyResponseAddReceiptData(applyResponse, appReceiptData, appReceiptDataHash)
}

export const transactionReceiptPass = async (
  tx: Tx.PenaltyTX,
  txId: string,
  wrappedStates: WrappedStates,
  dapp: Shardus,
  applyResponse: ShardusTypes.ApplyResponse,
): Promise<void> => {
  dapp.log(`PostApplied apply_penalty tx transactionReceiptPass: ${txId}`)
  const nodeAccount = wrappedStates[tx.reportedNodePublickKey].data as NodeAccount

  if (isLowStake(nodeAccount)) {
    if (LiberdusFlags.VerboseLogs) console.log(`isLowStake for nodeAccount ${nodeAccount.id}: true`, nodeAccount)
    // Limit the nodes that will get signs for remove node cert to <LiberdusFlags.numberOfNodesToInjectPenaltyTx>, which are closest to the low stake node address ( publicKey )
    // [TODO] This will make <LiberdusFlags.numberOfNodesToInjectPenaltyTx> nodes get signs; we can implement a cache system in the signer nodes to store the recent remove node cert signs they have signed for performance ( NOT URGENT )
    const closestNodes = dapp.getClosestNodes(tx.reportedNodePublickKey, LiberdusFlags.numberOfNodesToInjectPenaltyTx)
    const ourId = dapp.getNodeId()
    const isLuckyNode = closestNodes.some((nodeId) => nodeId === ourId)
    if (!isLuckyNode) {
      if (LiberdusFlags.VerboseLogs) console.log(`isLowStake: not lucky node, skipping getting signs for remove node cert`, ourId, closestNodes)
      return
    }
    const latestCycles = dapp.getLatestCycles()
    const currentCycle = latestCycles[0]
    if (!currentCycle) {
      /* prettier-ignore */ if (logFlags.error) console.log('isLowStake, No cycle records found', latestCycles)
      return
    }
    const certData: RemoveNodeCert = {
      nodePublicKey: tx.reportedNodePublickKey,
      cycle: currentCycle.counter,
    }
    // Wait about 5 seconds before trying to get the signs, to give time for all nodes have gained the updated node account state
    await _sleep(5 * ONE_SECOND)
    const signedAppData = await dapp.getAppDataSignatures(
      'sign-remove-node-cert',
      crypto.hashObj(certData),
      LiberdusFlags.MinRemoveNodeCertSig,
      certData,
      LiberdusFlags.ExtraNodesToSignRemoveNodeCert,
    )
    if (!signedAppData.success) {
      nestedCountersInstance.countEvent('isLowStake', 'unable to get signs for remove node cert')
      if (LiberdusFlags.VerboseLogs) console.log(`isLowStake: Unable to get signature for remove node cert`)
      // todo: find a better way to retry this
      return
    }
    certData.signs = signedAppData.signatures
    console.log(`isLowStake: Removing node with certData`, certData)
    dapp.removeNodeWithCertificiate(certData)
  }
}

export const keys = (tx: Tx.PenaltyTX, result: ShardusTypes.TransactionKeys): ShardusTypes.TransactionKeys => {
  result.sourceKeys = [tx.reportedNodePublickKey]
  result.targetKeys = [tx.nominator]
  result.allKeys = [...result.sourceKeys, ...result.targetKeys]
  return result
}

export const memoryPattern = (tx: Tx.PenaltyTX, result: ShardusTypes.TransactionKeys): ShardusTypes.ShardusMemoryPatternsInput => {
  return {
    rw: [tx.reportedNodePublickKey, tx.nominator],
    wo: [],
    on: [],
    ri: [],
    ro: [],
  }
}

export const createRelevantAccount = (
  dapp: Shardus,
  account: UserAccount | NodeAccount,
  accountId: string,
  tx: Tx.PenaltyTX,
  accountCreated = false,
): ShardusTypes.WrappedResponse => {
  if (!account) {
    throw new Error('Account must already exist in order to perform the apply_penalty transaction')
  }
  return dapp.createWrappedResponse(accountId, accountCreated, account.hash, account.timestamp, account)
}

function recordPenaltyTX(txId: string, tx: Tx.PenaltyTX): void {
  if (penaltyTxsMap.has(txId) === false) {
    penaltyTxsMap.set(txId, tx)
  }
}

export function clearOldPenaltyTxs(dapp: Shardus): void {
  if (penaltyTxsMap.size === 0) {
    nestedCountersInstance.countEvent('liberdus-penalty', `clearOldPenaltyTxs mapSize:0`)
    return
  }
  let deleteCount = 0
  nestedCountersInstance.countEvent('liberdus-penalty', `clearOldPenaltyTxs mapSize:${penaltyTxsMap.size}`)
  const now = dapp.shardusGetTime()
  for (const [txId, tx] of penaltyTxsMap.entries()) {
    const cycleDuration = dapp.config.p2p.cycleDuration * 1000
    if (now - tx.timestamp > 5 * cycleDuration) {
      penaltyTxsMap.delete(txId)
      deleteCount++
    }
  }
  nestedCountersInstance.countEvent('liberdus-penalty', `clearOldPenaltyTxs deleteCount: ${deleteCount}`)
}

export function isLowStake(nodeAccount: NodeAccount): boolean {
  /**
   * IMPORTANT FUTURE TO-DO =:
   * This function's logic needs to be updated once `stakeRequiredUsd` actually represents
   * USD value rather than LIB.
   */

  const stakeRequiredUSD = getStakeRequiredWei(AccountsStorage.cachedNetworkAccount)
  const lowStakeThresholdUSD = (stakeRequiredUSD * BigInt(LiberdusFlags.lowStakePercent * 100)) / BigInt(100)
  const lowStakeThreshold = lowStakeThresholdUSD

  return nodeAccount.stakeLock < lowStakeThreshold
}

export function getPenaltyForViolation(tx: Tx.PenaltyTX, stakeLock: bigint): bigint {
  const cachedNetworkAccount = AccountsStorage.cachedNetworkAccount
  switch (tx.violationType) {
    case ViolationType.LeftNetworkEarly:
      return (stakeLock * BigInt(cachedNetworkAccount.current.slashing.leftNetworkEarlyPenaltyPercent * 100)) / BigInt(100) // 20% of stakeLock
    case ViolationType.NodeRefuted:
      return (stakeLock * BigInt(cachedNetworkAccount.current.slashing.nodeRefutedPenaltyPercent * 100)) / BigInt(100) // 20% of stakeLock
    case ViolationType.SyncingTooLong:
      return (stakeLock * BigInt(cachedNetworkAccount.current.slashing.syncTimeoutPenaltyPercent * 100)) / BigInt(100) // 20% of stakeLock
    case ViolationType.DoubleVote:
      throw new Error('Violation type: ' + tx.violationType + ' Not implemented')
    default:
      throw new Error('Unexpected violation type: ' + tx.violationType)
  }
}
