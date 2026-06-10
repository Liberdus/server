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
  if (tx.timestamp < getApplyEligibleAt(proposal)) {
    response.reason = 'Grace period has not elapsed yet'
    return response
  }

  // Validate that every proposed change key actually exists in the target parameter set
  // and that the supplied value is coercible to the same type as the existing field.
  // This prevents unknown keys and type mismatches from reaching apply() where they would
  // throw unhandled exceptions and cause a consensus failure.
  const changes = getChanges(proposal)
  for (const change of changes) {
    let existing: unknown
    if (proposal.proposalType === 'governance') {
      existing = (network.current.dao as any)[change.key]
    } else if (proposal.proposalType === 'economic') {
      existing = (network.current as any)[change.key]
    } else {
      // protocol: Shardus server config (p2p, debug, etc.) — accessible via dapp.config
      existing = (dapp.config as any)[change.key]
    }
    if (existing === undefined) {
      response.reason = `Key "${change.key}" does not exist in ${proposal.proposalType} parameters`
      return response
    }
    // Economic proposals may only modify scalar fields in network.current; the nested "dao"
    // sub-object is governed exclusively by governance proposals.
    if (proposal.proposalType === 'economic' && typeof existing === 'object' && existing !== null && !Array.isArray(existing)) {
      response.reason = `Key "${change.key}" is an object parameter; economic proposals can only modify scalar fields`
      return response
    }
    // Try-coerce: confirm the value is parsable before we reach apply()
    try {
      const coerced = coerce(existing, change.value)
      // committeeAddresses gets extra structural validation beyond "is an array": the policy
      // requires 4-10 members, and a malformed/empty/oversized list would silently break
      // dao_committee_vote's quorum math and the emergency-proposal committee gate (see
      // Phase 1 review finding #20). Catch it here, before the change can ever be applied.
      if (change.key === 'committeeAddresses') {
        validateCommitteeAddresses(coerced)
      }
    } catch (err: any) {
      response.reason = `Value "${change.value}" is not valid for key "${change.key}": ${err.message}`
      return response
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
  const when = txTimestamp + config.ONE_SECOND * 10
  const changeCycle = getChangeCycle(dapp)

  let value: Tx.ApplyChangeNetworkParam | Tx.ApplyChangeConfig
  if (proposal.proposalType === 'protocol') {
    // Protocol proposals modify Shardus server config (p2p, debug, etc.) — dispatched as
    // apply_change_config so nodes apply the change via patchConfig on the next cycle.
    const configChange = buildConfigChange(dapp, changes)
    value = {
      type: TXTypes.apply_change_config,
      networkId: network.networkId,
      timestamp: when,
      from: tx.from,
      change: { cycle: changeCycle, change: configChange },
    } as Tx.ApplyChangeConfig
  } else {
    // Governance / economic proposals modify network.current — dispatched as
    // apply_change_network_param so nodes apply the change at runtime via patchAndUpdate.
    const appData = buildAppData(network, proposal.proposalType, changes)
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
    additionalInfo: { proposalType: proposal.proposalType, appliedChanges: changes.length },
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

function buildConfigChange(dapp: Shardus, changes: Array<{ key: string; value: string }>): Record<string, unknown> {
  const configChange: Record<string, unknown> = {}
  for (const change of changes) {
    const existing = (dapp.config as any)[change.key]
    configChange[change.key] = coerce(existing, change.value)
  }
  return configChange
}

function buildAppData(network: NetworkAccount, proposalType: string, changes: Array<{ key: string; value: string }>): Record<string, unknown> {
  const appData: Record<string, unknown> = proposalType === 'governance' ? { dao: {} } : {}
  for (const change of changes) {
    if (proposalType === 'governance') {
      const dao = network.current.dao
      const existing = (dao as any)[change.key]
      ;(appData.dao as Record<string, unknown>)[change.key] = coerce(existing, change.value)
    } else {
      const existing = (network.current as any)[change.key]
      appData[change.key] = coerce(existing, change.value)
    }
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
