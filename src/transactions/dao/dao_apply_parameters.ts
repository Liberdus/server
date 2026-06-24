import * as crypto from '../../crypto'
import { Shardus, ShardusTypes } from '@shardus/core'
import * as config from '../../config'
import { NetworkAccount, UserAccount, WrappedStates, Tx, AppReceiptData, DaoProposalAccount, OurAppDefinedData, TXTypes } from '../../@types'
import { SafeBigIntMath } from '../../utils/safeBigIntMath'
import * as AccountsStorage from '../../storage/accountStorage'
import * as utils from '../../utils'
import { isUserAccount, isDaoProposalAccount } from '../../@types/accountTypeGuards'
import { Utils } from '@shardus/lib-types'
import { getApplyEligibleAt } from '../../accounts/daoProposalAccount'
import { buildNestedChange, mergeNestedChange, resolveChanges, ResolvedChange } from '../../utils/daoParamResolver'
import { coerce, validateChangesPayload } from '../../utils/daoParamValidation'

export const validate_fields = (tx: Tx.DaoApplyParameters, response: ShardusTypes.IncomingTransactionResult): ShardusTypes.IncomingTransactionResult => {
  if (utils.isValidAddress(tx.from) === false) {
    response.reason = 'tx "from" is not a valid address'
    return response
  }
  if (utils.isValidAddress(tx.proposalId) === false) {
    response.reason = 'tx "proposalId" must be a 64-char hex string'
    return response
  }
  if (!tx.sign || !tx.sign.owner || !tx.sign.sig || tx.sign.owner !== tx.from) {
    response.reason = 'tx must be signed by the from account'
    return response
  }
  if (crypto.verifyObj(tx) === false) {
    response.reason = 'incorrect signing'
    return response
  }
  response.success = true
  return response
}

export const validate = (
  tx: Tx.DaoApplyParameters,
  wrappedStates: WrappedStates,
  response: ShardusTypes.IncomingTransactionResult,
  dapp: Shardus,
): ShardusTypes.IncomingTransactionResult => {
  const from = wrappedStates[tx.from]?.data as UserAccount
  const proposal = wrappedStates[tx.proposalId]?.data as DaoProposalAccount
  const network = wrappedStates[config.networkAccount]?.data as NetworkAccount

  if (!from || !isUserAccount(from)) {
    response.reason = 'from account not found or is not a UserAccount'
    return response
  }
  if (!proposal || !isDaoProposalAccount(proposal)) {
    response.reason = 'Proposal account not found or is not a DaoProposalAccount'
    return response
  }
  if (!network) {
    response.reason = 'Network account not found'
    return response
  }
  if (proposal.status !== 'accepted') {
    response.reason = `Proposal is not in accepted status (current: ${proposal.status})`
    return response
  }
  if (!['governance', 'economic', 'protocol'].includes(proposal.proposalType)) {
    response.reason = `Proposal type "${proposal.proposalType}" does not support parameter application`
    return response
  }
  if (proposal.emergency) {
    // Emergency proposals have no grace period and can be applied immediately after being
    // accepted, but only a committee member may submit the apply tx.
    if (!proposal.committeeAddresses.includes(tx.from)) {
      response.reason = 'Only a committee member can submit an apply tx for an emergency proposal'
      return response
    }
  } else if (tx.timestamp < getApplyEligibleAt(proposal)) {
    response.reason = 'Grace period has not elapsed yet'
    return response
  }

  // Re-validate change keys and values against the live network state before applying.
  const changes = getChanges(proposal)
  const changesError = validateChangesPayload(proposal.proposalType, changes, network, dapp)
  if (changesError) {
    response.reason = changesError
    return response
  }
  const txFeeWei = utils.getTransactionFeeWei(AccountsStorage.cachedNetworkAccount)
  if (from.data.balance < txFeeWei) {
    response.reason = 'Insufficient balance to cover the transaction fee'
    return response
  }

  response.success = true
  response.reason = 'This transaction is valid!'
  return response
}

export const apply = (
  tx: Tx.DaoApplyParameters,
  txTimestamp: number,
  txId: string,
  wrappedStates: WrappedStates,
  dapp: Shardus,
  applyResponse: ShardusTypes.ApplyResponse,
): void => {
  const from = wrappedStates[tx.from].data as UserAccount
  const proposal = wrappedStates[tx.proposalId].data as DaoProposalAccount
  const network = wrappedStates[config.networkAccount].data as NetworkAccount
  const txFeeWei = utils.getTransactionFeeWei(AccountsStorage.cachedNetworkAccount)

  from.data.balance = SafeBigIntMath.subtract(from.data.balance, txFeeWei)

  const changes = getChanges(proposal)
  const resolvedChanges = resolveChanges(proposal.proposalType, network, dapp, changes)
  const when = txTimestamp + config.ONE_SECOND * 10
  const now = dapp.shardusGetTime()
  console.log(
    `dao_apply_parameters global tx timing: txId=${txId} txTimestamp=${txTimestamp} globalTimestamp=${when} currentTime=${now} ` +
      `isCurrentTimePastGlobalTimestamp=${now > when} deltaMs=${now - when}`,
  )
  const changeCycle = getChangeCycle(dapp)

  let value: Tx.ApplyChangeNetworkParam | Tx.ApplyChangeConfig
  if (proposal.proposalType === 'protocol') {
    // Protocol proposals update Shardus server config via apply_change_config.
    const configChange = buildConfigChange(resolvedChanges)
    value = {
      type: TXTypes.apply_change_config,
      networkId: network.networkId,
      timestamp: when,
      from: tx.from,
      change: { cycle: changeCycle, change: configChange },
    } as Tx.ApplyChangeConfig
  } else {
    // Governance and economic proposals update network.current via apply_change_network_param.
    const appData = buildAppData(proposal.proposalType, resolvedChanges)
    value = {
      type: TXTypes.apply_change_network_param,
      networkId: network.networkId,
      timestamp: when,
      from: tx.from,
      change: { cycle: changeCycle, change: {}, appData },
    } as Tx.ApplyChangeNetworkParam
  }

  const addressHash = wrappedStates[config.networkAccount].stateId
  const clonedNetworkAccount = utils.deepCopy(network)
  clonedNetworkAccount.listOfChanges.push(value.change)
  clonedNetworkAccount.timestamp = when
  const afterStateHash = utils.calculateAccountHash(clonedNetworkAccount as any)

  const ourAppDefinedData = applyResponse.appDefinedData as OurAppDefinedData
  ourAppDefinedData.globalMsg = { address: config.networkAccount, addressHash, value, when, source: tx.from, afterStateHash }

  from.timestamp = txTimestamp
  proposal.status = 'applied'
  proposal.timestamp = txTimestamp

  const appReceiptData: AppReceiptData = {
    txId,
    timestamp: txTimestamp,
    success: true,
    from: tx.from,
    to: tx.proposalId,
    type: tx.type,
    transactionFee: txFeeWei,
    additionalInfo: { proposalType: proposal.proposalType, change: value.change },
  }
  const appReceiptDataHash = crypto.hashObj(appReceiptData)
  dapp.applyResponseAddReceiptData(applyResponse, appReceiptData, appReceiptDataHash)
  dapp.log('Applied dao_apply_parameters tx', tx.proposalId, proposal.proposalType, changes.length, 'changes', Utils.safeStringify(value))
}

function getChanges(proposal: DaoProposalAccount): Array<{ key: string; value: string }> {
  if (proposal.proposalType === 'governance' && proposal.governance) {
    return proposal.governance.changes
  }
  if (proposal.proposalType === 'economic' && proposal.economic) {
    return proposal.economic.changes
  }
  if (proposal.proposalType === 'protocol' && proposal.protocol) {
    return proposal.protocol.changes
  }
  return []
}

function buildConfigChange(resolvedChanges: ResolvedChange[]): Record<string, unknown> {
  const configChange: Record<string, unknown> = {}
  for (const rc of resolvedChanges) {
    const coerced = coerce(rc.existing, rc.value)
    mergeNestedChange(configChange, buildNestedChange(rc.path, coerced))
  }
  return configChange
}

function buildAppData(proposalType: DaoProposalAccount['proposalType'], resolvedChanges: ResolvedChange[]): Record<string, unknown> {
  if (proposalType === 'governance') {
    // Governance changes are scoped to network.current.dao, so nest them under a dao key.
    const dao: Record<string, unknown> = {}
    for (const rc of resolvedChanges) {
      const coerced = coerce(rc.existing, rc.value)
      mergeNestedChange(dao, buildNestedChange(rc.path, coerced))
    }
    return { dao }
  }
  const appData: Record<string, unknown> = {}
  for (const rc of resolvedChanges) {
    const coerced = coerce(rc.existing, rc.value)
    mergeNestedChange(appData, buildNestedChange(rc.path, coerced))
  }
  return appData
}

function getChangeCycle(dapp: Shardus): number {
  const [cycleData] = dapp.getLatestCycles()
  if (cycleData && typeof cycleData.counter === 'number') {
    return cycleData.counter + 3
  }
  throw new Error('Unable to determine change cycle: no cycle data available from dapp.getLatestCycles()')
}

export const transactionReceiptPass = (
  tx: Tx.DaoApplyParameters,
  txId: string,
  wrappedStates: WrappedStates,
  dapp: Shardus,
  applyResponse: ShardusTypes.ApplyResponse,
): void => {
  const { address, addressHash, value, when, source, afterStateHash } = (applyResponse.appDefinedData as OurAppDefinedData).globalMsg
  dapp.setGlobal(address, addressHash, value, when, source, afterStateHash)
  dapp.log(`PostApplied dao_apply_parameters tx transactionReceiptPass: ${Utils.safeStringify({ address, addressHash, value, when, source })}`)
}

export const createFailedAppReceiptData = (
  tx: Tx.DaoApplyParameters,
  txTimestamp: number,
  txId: string,
  wrappedStates: WrappedStates,
  dapp: Shardus,
  applyResponse: ShardusTypes.ApplyResponse,
  reason: string,
): void => {
  const from = wrappedStates[tx.from]?.data as UserAccount
  let transactionFee = BigInt(0)
  if (from) {
    const txFeeWei = utils.getTransactionFeeWei(AccountsStorage.cachedNetworkAccount)
    if (from.data.balance >= txFeeWei) {
      transactionFee = txFeeWei
      from.data.balance = SafeBigIntMath.subtract(from.data.balance, transactionFee)
    } else {
      transactionFee = from.data.balance
      from.data.balance = BigInt(0)
    }
    from.timestamp = txTimestamp
  }

  const appReceiptData: AppReceiptData = {
    txId,
    timestamp: txTimestamp,
    success: false,
    reason,
    from: tx.from,
    to: tx.proposalId,
    type: tx.type,
    transactionFee,
  }
  const appReceiptDataHash = crypto.hashObj(appReceiptData)
  dapp.applyResponseAddReceiptData(applyResponse, appReceiptData, appReceiptDataHash)
}

export const keys = (tx: Tx.DaoApplyParameters, result: ShardusTypes.TransactionKeys): ShardusTypes.TransactionKeys => {
  result.sourceKeys = [tx.from]
  result.targetKeys = [tx.proposalId, config.networkAccount]
  result.allKeys = [...result.sourceKeys, ...result.targetKeys]
  return result
}

export const memoryPattern = (tx: Tx.DaoApplyParameters, result: ShardusTypes.TransactionKeys): ShardusTypes.ShardusMemoryPatternsInput => {
  return {
    rw: [tx.from, tx.proposalId],
    wo: [],
    on: [],
    ri: [],
    ro: [config.networkAccount],
  }
}

export const createRelevantAccount = (
  dapp: Shardus,
  account: UserAccount | DaoProposalAccount,
  accountId: string,
  tx: Tx.DaoApplyParameters,
  accountCreated = false,
): ShardusTypes.WrappedResponse => {
  if (!account) {
    throw new Error(`dao_apply_parameters.createRelevantAccount: account ${accountId} does not exist`)
  }
  return dapp.createWrappedResponse(accountId, accountCreated, account.hash, account.timestamp, account)
}
