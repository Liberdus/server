import * as crypto from '../crypto'
import { Shardus, ShardusTypes } from '@shardus/core'
import * as utils from '../utils'
import create from '../accounts'
import * as config from '../config'
import { UserAccount, NetworkAccount, WrappedStates, Tx, AppReceiptData, DaoProposalsMeta, DaoProposalAccount } from '../@types'
import { SafeBigIntMath } from '../utils/safeBigIntMath'
import * as AccountsStorage from '../storage/accountStorage'
import { isUserAccount, isDaoProposalsMeta, isDaoProposalAccount } from '../@types/accountTypeGuards'
import { DAO_PROPOSALS_META_ID_STRING } from '../accounts/daoProposalsMetaAccount'
import { validateChangesPayload } from '../utils/daoParamValidation'

// options[0] must be an affirmative string — dao_vote_result treats winnerIndex === 0 as "accepted".
// Without this guard, inverted options (e.g. ['no', 'yes']) would silently flip the vote outcome.
export const AFFIRMATIVE_OPTION_STRINGS = ['yes', 'accept', 'approve']

export const validate_fields = (
  tx: Tx.DaoProposalCreate,
  response: ShardusTypes.IncomingTransactionResult,
  dapp: Shardus,
): ShardusTypes.IncomingTransactionResult => {
  if (utils.isValidAddress(tx.from) === false) {
    response.reason = 'tx "from" is not a valid address'
    return response
  }
  if (utils.isValidAddress(tx.proposalId) === false) {
    response.reason = 'tx "proposalId" is not a valid address'
    return response
  }
  if (utils.isValidAddress(tx.metaId) === false) {
    response.reason = 'tx "metaId" is not a valid address'
    return response
  }
  if (typeof tx.emergency !== 'boolean') {
    response.reason = 'tx "emergency" must be a boolean'
    return response
  }
  if (!['governance', 'economic', 'protocol'].includes(tx.proposalType)) {
    response.reason = 'tx "proposalType" must be one of: governance, economic, protocol'
    return response
  }
  if (tx.gracePeriod !== undefined && (typeof tx.gracePeriod !== 'number' || tx.gracePeriod < 0)) {
    response.reason = 'tx "gracePeriod" must be a non-negative number if provided'
    return response
  }
  if (typeof tx.description !== 'string' || tx.description.length === 0 || tx.description.length > 10000) {
    response.reason = 'tx "description" must be a non-empty string of at most 10000 characters'
    return response
  }
  if (!Array.isArray(tx.options) || tx.options.length < 2 || tx.options.length > 10) {
    response.reason = 'tx "options" must be an array with 2 to 10 entries'
    return response
  }
  for (const opt of tx.options) {
    if (typeof opt !== 'string' || opt.trim().length === 0) {
      response.reason = 'each entry in tx "options" must be a non-empty string'
      return response
    }
  }
  if (!AFFIRMATIVE_OPTION_STRINGS.includes(tx.options[0].trim().toLowerCase())) {
    response.reason = `tx "options[0]" must be a recognized affirmative choice (one of: ${AFFIRMATIVE_OPTION_STRINGS.join(
      ', ',
    )}) — dao_vote_result treats option index 0 as the "accept this change" outcome`
    return response
  }
  if (tx.startTime !== undefined && (typeof tx.startTime !== 'number' || tx.startTime < 0 || !Number.isFinite(tx.startTime))) {
    response.reason = 'tx "startTime" must be a non-negative number if provided'
    return response
  }
  // startTime can be set in the future so the committee has time to review before voting begins; defaults to creation time.
  if (tx.startTime !== undefined && tx.startTime < tx.timestamp) {
    response.reason = `tx "startTime" (${tx.startTime}) cannot be earlier than the creation time (${tx.timestamp})`
    return response
  }
  const payload = tx[tx.proposalType as 'governance' | 'economic' | 'protocol']
  if (!payload || !Array.isArray(payload.changes) || payload.changes.length === 0) {
    response.reason = `tx "${tx.proposalType}" payload must include a non-empty "changes" array`
    return response
  }
  // Structural check: validate field types and reject duplicate raw keys before the
  // heavier path-resolution and coerce pass in validateChangesPayload below.
  const seenKeys = new Set<string>()
  for (const [i, change] of payload.changes.entries()) {
    if (change === null || typeof change !== 'object') {
      response.reason = `each change must be an object { key: string; value: string; current: string } - got ${change === null ? 'null' : typeof change} at changes[${i}]`
      return response
    }
    if (typeof change.key !== 'string' || change.key.length === 0) {
      response.reason = `each change must have a non-empty string "key" - got ${change.key === '' ? 'an empty string' : typeof change.key} at changes[${i}].key`
      return response
    }
    if (typeof change.value !== 'string') {
      response.reason = `each change must have a string "value" - got ${typeof change.value} at the "value" for key '${change.key}'`
      return response
    }
    if (typeof change.current !== 'string') {
      response.reason = `each change must have a string "current" - got ${typeof change.current} at the "current" for key '${change.key}'`
      return response
    }
    if (seenKeys.has(change.key)) {
      response.reason = `each change must have a unique "key" - got duplicate "${change.key}"`
      return response
    }
    seenKeys.add(change.key)
  }
  // Quick check using cached network account.
  const changesError = validateChangesPayload(tx.proposalType, payload.changes, AccountsStorage.cachedNetworkAccount, dapp)
  if (changesError) {
    response.reason = changesError
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
  tx: Tx.DaoProposalCreate,
  wrappedStates: WrappedStates,
  response: ShardusTypes.IncomingTransactionResult,
  dapp: Shardus,
): ShardusTypes.IncomingTransactionResult => {
  const network = wrappedStates[config.networkAccount]?.data as NetworkAccount
  const from = wrappedStates[tx.from]?.data as UserAccount
  const meta = wrappedStates[tx.metaId]?.data as DaoProposalsMeta
  const proposal = wrappedStates[tx.proposalId]?.data as DaoProposalAccount

  if (!network) {
    response.reason = 'Network account not found'
    return response
  }
  if (!from || !isUserAccount(from)) {
    response.reason = 'from account not found or is not a UserAccount'
    return response
  }
  if (meta && !isDaoProposalsMeta(meta)) {
    response.reason = 'Not a DaoProposalsMeta account'
    return response
  }

  if (proposal && !isDaoProposalAccount(proposal)) {
    response.reason = 'Not a DaoProposalAccount'
    return response
  }

  const expectedMetaId = crypto.hash(DAO_PROPOSALS_META_ID_STRING)
  if (tx.metaId !== expectedMetaId) {
    response.reason = 'tx "metaId" does not match the DAO proposals meta account address'
    return response
  }

  const nextCount = (meta?.count ?? 0) + 1
  const expectedProposalId = crypto.hash(`dao proposal #${nextCount}`)
  if (tx.proposalId !== expectedProposalId) {
    response.reason = `tx "proposalId" does not match the expected next proposal id (expected ${expectedProposalId})`
    return response
  }

  const daoParams = network.current.dao

  if (tx.emergency && !daoParams.committeeAddresses.includes(tx.from)) {
    response.reason = 'Only committee members can create emergency proposals'
    return response
  }

  const gracePeriod = tx.gracePeriod ?? 0
  if (gracePeriod > daoParams.graceDuration) {
    response.reason = `tx "gracePeriod" (${gracePeriod}ms) exceeds the maximum allowed grace duration (${daoParams.graceDuration}ms)`
    return response
  }

  // Recheck with live wrappedStates — validate_fields ran against the cached network account.
  const txPayload = tx[tx.proposalType as 'governance' | 'economic' | 'protocol']
  const changesError = validateChangesPayload(tx.proposalType, txPayload?.changes ?? [], network, dapp)
  if (changesError) {
    response.reason = changesError
    return response
  }

  // Emergency proposals do not require a proposal fee.
  const proposalFeeWei = tx.emergency ? 0n : utils.usdStrToWei(daoParams.proposalFeeUsdStr, network)
  const txFeeWei = utils.getTransactionFeeWei(AccountsStorage.cachedNetworkAccount)
  const totalRequired = proposalFeeWei + txFeeWei

  if (from.data.balance < totalRequired) {
    response.reason = 'Insufficient balance to cover the proposal fee and transaction fee'
    return response
  }

  response.success = true
  response.reason = 'This transaction is valid!'
  return response
}

export const apply = (
  tx: Tx.DaoProposalCreate,
  txTimestamp: number,
  txId: string,
  wrappedStates: WrappedStates,
  dapp: Shardus,
  applyResponse: ShardusTypes.ApplyResponse,
): void => {
  const network = wrappedStates[config.networkAccount].data as NetworkAccount
  const from = wrappedStates[tx.from].data as UserAccount
  const meta = wrappedStates[tx.metaId].data as DaoProposalsMeta
  const proposal = wrappedStates[tx.proposalId].data as DaoProposalAccount

  const daoParams = network.current.dao
  // Emergency proposals do not require a proposal fee.
  const proposalFeeWei = tx.emergency ? 0n : utils.usdStrToWei(daoParams.proposalFeeUsdStr, network)
  const txFeeWei = utils.getTransactionFeeWei(AccountsStorage.cachedNetworkAccount)

  // Deduct fees
  from.data.balance = SafeBigIntMath.subtract(from.data.balance, proposalFeeWei)
  from.data.balance = SafeBigIntMath.subtract(from.data.balance, txFeeWei)

  // Increment proposal counter
  meta.count += 1

  // Build the proposal
  proposal.number = meta.count
  proposal.emergency = tx.emergency
  proposal.proposalType = tx.proposalType
  proposal.creationTime = txTimestamp
  // Defaults to creation time if omitted; reviewEnd, votingStart, votingEnd, claimEnd, and applyEligibleAt all derive from startTime.
  proposal.startTime = tx.startTime ?? txTimestamp
  proposal.description = tx.description
  proposal.options = tx.options
  proposal.totalVote = tx.options.map(() => 0n)
  // The proposal fee seeds the voter reward pool; burned (zeroed) if the committee withholds, otherwise kept to incentivize voters.
  proposal.voterRewardPool = proposalFeeWei
  proposal.initialBurnedReward = 0n
  proposal.finalBurnedReward = 0n
  proposal.committeeVotes = []
  proposal.voterList = []
  proposal.claimList = []
  proposal.gracePeriod = tx.gracePeriod ?? 0

  // Snapshot current DAO params so the proposal is evaluated against the rules in effect at creation time, not at apply time.
  proposal.proposalFeeUsdStr = daoParams.proposalFeeUsdStr
  proposal.voteThresholdUsdStr = daoParams.voteThresholdUsdStr
  proposal.minimumSpendUsdStr = daoParams.minimumSpendUsdStr
  proposal.voteExponent = daoParams.voteExponent
  proposal.pctBurned = daoParams.pctBurned
  proposal.reviewDuration = daoParams.reviewDuration
  proposal.votingDuration = daoParams.votingDuration
  proposal.graceDuration = daoParams.graceDuration
  proposal.claimDuration = daoParams.claimDuration
  proposal.committeeAddresses = [...daoParams.committeeAddresses]

  if (tx.governance) proposal.governance = tx.governance
  if (tx.economic) proposal.economic = tx.economic
  if (tx.protocol) proposal.protocol = tx.protocol

  proposal.status = 'review'

  from.timestamp = txTimestamp
  meta.timestamp = txTimestamp
  proposal.timestamp = txTimestamp

  const appReceiptData: AppReceiptData = {
    txId,
    timestamp: txTimestamp,
    success: true,
    from: tx.from,
    to: tx.proposalId,
    type: tx.type,
    transactionFee: txFeeWei,
    additionalInfo: {
      proposalNumber: meta.count,
      emergency: tx.emergency,
      proposalFee: proposalFeeWei,
    },
  }
  const appReceiptDataHash = crypto.hashObj(appReceiptData)
  dapp.applyResponseAddReceiptData(applyResponse, appReceiptData, appReceiptDataHash)
  dapp.log('Applied dao_proposal_create tx', from.id, tx.proposalId)
}

export const createFailedAppReceiptData = (
  tx: Tx.DaoProposalCreate,
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

export const keys = (tx: Tx.DaoProposalCreate, result: ShardusTypes.TransactionKeys): ShardusTypes.TransactionKeys => {
  result.sourceKeys = [tx.from]
  result.targetKeys = [tx.metaId, tx.proposalId, config.networkAccount]
  result.allKeys = [...result.sourceKeys, ...result.targetKeys]
  return result
}

export const memoryPattern = (tx: Tx.DaoProposalCreate, result: ShardusTypes.TransactionKeys): ShardusTypes.ShardusMemoryPatternsInput => {
  return {
    rw: [tx.from, tx.metaId, tx.proposalId],
    wo: [],
    on: [],
    ri: [],
    ro: [config.networkAccount],
  }
}

export const createRelevantAccount = (
  dapp: Shardus,
  account: UserAccount | DaoProposalsMeta | DaoProposalAccount,
  accountId: string,
  tx: Tx.DaoProposalCreate,
  accountCreated = false,
): ShardusTypes.WrappedResponse => {
  if (!account) {
    if (accountId === tx.proposalId) {
      account = create.daoProposalAccount(accountId)
      accountCreated = true
    } else if (accountId === tx.metaId) {
      account = create.daoProposalsMetaAccount(accountId)
      accountCreated = true
    } else {
      throw new Error(`dao_proposal_create.createRelevantAccount: UserAccount ${accountId} does not exist`)
    }
  }
  return dapp.createWrappedResponse(accountId, accountCreated, account.hash, account.timestamp, account)
}
