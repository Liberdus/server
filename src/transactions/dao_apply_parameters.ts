import * as crypto from '../crypto'
import { Shardus, ShardusTypes } from '@shardus/core'
import * as config from '../config'
import { NetworkAccount, UserAccount, WrappedStates, Tx, AppReceiptData, DaoProposalAccount, OurAppDefinedData, TXTypes } from '../@types'
import { SafeBigIntMath } from '../utils/safeBigIntMath'
import * as AccountsStorage from '../storage/accountStorage'
import * as utils from '../utils'
import { isUserAccount, isDaoProposalAccount } from '../@types/accountTypeGuards'
import { LiberdusFlags } from '../config'
import { Utils } from '@shardus/lib-types'
import { getApplyEligibleAt } from '../accounts/daoProposalAccount'
import { resolveParamPathForProposalType, buildNestedChange, mergeNestedChange, pathsOverlap } from '../utils/daoParamResolver'
import type { ResolvedParam } from '../utils/daoParamResolver'


export const validate_fields = (tx: Tx.DaoApplyParameters, response: ShardusTypes.IncomingTransactionResult): ShardusTypes.IncomingTransactionResult => {
  if (!LiberdusFlags.enableNewDAOTransactions) {
    response.reason = 'New DAO transactions are not enabled'
    return response
  }
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
  const from: UserAccount = wrappedStates[tx.from] && (wrappedStates[tx.from].data as unknown as UserAccount)
  const proposal: DaoProposalAccount = wrappedStates[tx.proposalId] && (wrappedStates[tx.proposalId].data as unknown as DaoProposalAccount)
  const network: NetworkAccount = wrappedStates[config.networkAccount] && (wrappedStates[config.networkAccount].data as unknown as NetworkAccount)

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

  // Resolve each change key to its actual path and validate the value type before apply().
  const changes = getChanges(proposal)
  const resolvedPaths: string[][] = []
  for (const change of changes) {
    const resolved = resolveParamPathForProposalType(proposal.proposalType, network, dapp, change.key)
    if (!resolved) {
      response.reason = `Key "${change.key}" does not exist in ${proposal.proposalType} parameters`
      return response
    }
    // Economic proposals cannot touch the dao subtree — only governance proposals can.
    if (proposal.proposalType === 'economic' && resolved.path.length === 1 && resolved.path[0] === 'dao') {
      response.reason = `Key "${change.key}" is the "dao" parameters object; economic proposals cannot modify it`
      return response
    }
    resolvedPaths.push(resolved.path)
    try {
      const coerced = coerce(resolved.existing, change.value)
      // committeeAddresses needs size/format checks beyond type-checking since quorum math depends on it.
      if (resolved.path[resolved.path.length - 1] === 'committeeAddresses') {
        validateCommitteeAddresses(coerced)
      }
    } catch (err: any) {
      response.reason = `Value "${change.value}" is not valid for key "${change.key}" (resolved to "${resolved.path.join('.')}"): ${err.message}`
      return response
    }
  }
  // Reject if two changes resolve to the same path or one is a prefix of the other.
  for (let i = 0; i < resolvedPaths.length; i++) {
    for (let j = i + 1; j < resolvedPaths.length; j++) {
      if (pathsOverlap(resolvedPaths[i], resolvedPaths[j])) {
        response.reason = `changes contain overlapping targets: "${resolvedPaths[i].join('.')}" and "${resolvedPaths[j].join('.')}"`
        return response
      }
    }
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
  const from: UserAccount = wrappedStates[tx.from].data as unknown as UserAccount
  const proposal: DaoProposalAccount = wrappedStates[tx.proposalId].data as unknown as DaoProposalAccount
  const network: NetworkAccount = wrappedStates[config.networkAccount].data as unknown as NetworkAccount
  const txFeeWei = utils.getTransactionFeeWei(AccountsStorage.cachedNetworkAccount)

  from.data.balance = SafeBigIntMath.subtract(from.data.balance, txFeeWei)

  const changes = getChanges(proposal)
  const resolvedChanges = resolveChanges(proposal.proposalType, network, dapp, changes)
  const resolvedPaths = resolvedChanges.map(rc => rc.path.join('.'))
  const when = txTimestamp + config.ONE_SECOND * 10
  console.log('Global tx timestamp', txId, when, txTimestamp, dapp.shardusGetTime(), dapp.shardusGetTime() > when, dapp.shardusGetTime() - when)
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
    additionalInfo: { proposalType: proposal.proposalType, appliedChanges: changes.length, resolvedPaths },
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

interface ResolvedChange {
  key: string
  value: string
  path: string[]
  existing: unknown
}

// Resolves every change to its target path and existing value.
// A failure here means validate() and apply() diverged — should never happen.
function resolveChanges(
  proposalType: DaoProposalAccount['proposalType'],
  network: NetworkAccount,
  dapp: Shardus,
  changes: Array<{ key: string; value: string }>,
): ResolvedChange[] {
  return changes.map(change => {
    const resolved: ResolvedParam | undefined = resolveParamPathForProposalType(proposalType, network, dapp, change.key)
    if (!resolved) {
      throw new Error(`key "${change.key}" does not exist in ${proposalType} parameters`)
    }
    return { key: change.key, value: change.value, path: resolved.path, existing: resolved.existing }
  })
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

function validateCommitteeAddresses(coerced: unknown): void {
  if (!Array.isArray(coerced)) {
    throw new Error('committeeAddresses must be an array')
  }
  const min = LiberdusFlags.minCommitteeMembers
  const max = LiberdusFlags.maxCommitteeMembers
  if (coerced.length < min || coerced.length > max) {
    throw new Error(`committeeAddresses must contain between ${min} and ${max} members (got ${coerced.length})`)
  }
  for (const addr of coerced) {
    if (typeof addr !== 'string' || !utils.isValidAddress(addr)) {
      throw new Error(`committeeAddresses contains an invalid address: "${addr}"`)
    }
  }
  if (new Set(coerced).size !== coerced.length) {
    throw new Error('committeeAddresses contains duplicate addresses')
  }
}

function coerce(existing: unknown, value: string): unknown {
  if (typeof existing === 'number') {
    const n = Number(value)
    if (!Number.isFinite(n)) throw new Error(`"${value}" is not a valid finite number for this field`)
    return n
  }
  if (typeof existing === 'boolean') {
    if (value !== 'true' && value !== 'false') throw new Error(`"${value}" is not a valid boolean — must be exactly "true" or "false"`)
    return value === 'true'
  }
  if (typeof existing === 'bigint') {
    if (!/^-?\d+$/.test(value)) throw new Error(`"${value}" is not a valid integer string for this field`)
    return BigInt(value)
  }
  if (Array.isArray(existing)) {
    const parsed = JSON.parse(value)
    if (!Array.isArray(parsed)) throw new Error(`"${value}" does not parse to an array`)
    return parsed
  }
  if (typeof existing === 'object' && existing !== null) {
    const parsed = JSON.parse(value)
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      throw new Error(`"${value}" does not parse to an object`)
    }
    // Every key in the proposed patch must exist in the target object with a matching type.
    // comparePropertiesTypes checks this recursively, preventing unknown keys or type mismatches.
    if (!utils.comparePropertiesTypes(parsed, existing)) {
      throw new Error(`"${value}" contains keys or types not present in the existing object`)
    }
    return parsed
  }
  return value
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
  const from: UserAccount = wrappedStates[tx.from] && (wrappedStates[tx.from].data as unknown as UserAccount)
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
