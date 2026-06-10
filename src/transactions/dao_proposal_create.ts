import * as crypto from '../crypto'
import { Shardus, ShardusTypes } from '@shardus/core'
import * as utils from '../utils'
import create from '../accounts'
import * as config from '../config'
import { UserAccount, NetworkAccount, WrappedStates, Tx, AppReceiptData, DaoProposalsMeta, DaoProposalAccount } from '../@types'
import { SafeBigIntMath } from '../utils/safeBigIntMath'
import * as AccountsStorage from '../storage/accountStorage'
import { isUserAccount } from '../@types/accountTypeGuards'
import { LiberdusFlags } from '../config'
import { DAO_PROPOSALS_META_ID_STRING } from '../accounts/daoProposalsMetaAccount'

// dao_vote_result.apply hard-codes the convention that options[0] is the affirmative
// ("apply this change") choice: `status = winnerIndex === 0 ? 'accepted' : 'rejected'`.
// The policy describes ballots as "usually [yes, no]" — enforce that options[0] is one of
// these recognized affirmative strings (case-insensitive) so a governance/economic/protocol
// proposal can never be created with inverted semantics (e.g. options: ['no', 'yes']) that
// would silently flip the on-chain outcome of a community vote (review finding #10).
export const AFFIRMATIVE_OPTION_STRINGS = ['yes', 'accept', 'approve']

export const validate_fields = (tx: Tx.DaoProposalCreate, response: ShardusTypes.IncomingTransactionResult): ShardusTypes.IncomingTransactionResult => {
  if (!LiberdusFlags.enableNewDAOTransactions) {
    response.reason = 'New DAO transactions are not enabled'
    return response
  }
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
  if (typeof tx.gracePeriod !== 'number' || tx.gracePeriod < 0) {
    response.reason = 'tx "gracePeriod" must be a non-negative number'
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
  // governance/economic/protocol proposals are the only types this handler supports (checked
  // above), and dao_vote_result.apply unconditionally treats winnerIndex === 0 as "accepted"
  // for all of them — so options[0] must always be the recognized affirmative choice.
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
  // startTime gives the committee some lead time before review begins; it cannot be in the past
  // relative to creation (tx.timestamp). If omitted, it defaults to creationTime in apply().
  if (tx.startTime !== undefined && tx.startTime < tx.timestamp) {
    response.reason = `tx "startTime" (${tx.startTime}) cannot be earlier than the creation time (${tx.timestamp})`
    return response
  }
  // Validate the type-specific changes payload
  const payload = tx[tx.proposalType as 'governance' | 'economic' | 'protocol']
  if (!payload || !Array.isArray(payload.changes) || payload.changes.length === 0) {
    response.reason = `tx "${tx.proposalType}" payload must include a non-empty "changes" array`
    return response
  }
  const seenKeys = new Set<string>()
  for (const change of payload.changes) {
    if (typeof change.key !== 'string' || change.key.length === 0) {
      response.reason = 'each change must have a non-empty string "key"'
      return response
    }
    if (typeof change.value !== 'string') {
      response.reason = 'each change must have a string "value"'
      return response
    }
    if (typeof change.current !== 'string') {
      response.reason = 'each change must have a string "current"'
      return response
    }
    if (seenKeys.has(change.key)) {
      response.reason = `duplicate key "${change.key}" in changes array`
      return response
    }
    seenKeys.add(change.key)
    // Early key-existence check against the cached network account for governance/economic.
    // Protocol key-existence (against dapp.config) is deferred to validate() where dapp is available.
    const cachedNetwork = AccountsStorage.cachedNetworkAccount
    if (cachedNetwork) {
      if (tx.proposalType === 'governance' && (cachedNetwork.current.dao as any)[change.key] === undefined) {
        response.reason = `key "${change.key}" does not exist in governance parameters`
        return response
      }
      if (tx.proposalType === 'economic' && (cachedNetwork.current as any)[change.key] === undefined) {
        response.reason = `key "${change.key}" does not exist in economic parameters`
        return response
      }
    }
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
  const network: NetworkAccount = wrappedStates[config.networkAccount] && (wrappedStates[config.networkAccount].data as unknown as NetworkAccount)
  const from: UserAccount = wrappedStates[tx.from] && (wrappedStates[tx.from].data as unknown as UserAccount)
  const meta: DaoProposalsMeta = wrappedStates[tx.metaId] && (wrappedStates[tx.metaId].data as unknown as DaoProposalsMeta)

  if (!network) {
    response.reason = 'Network account not found'
    return response
  }
  if (!from || !isUserAccount(from)) {
    response.reason = 'from account not found or is not a UserAccount'
    return response
  }
  if (!meta) {
    response.reason = 'DAO proposals meta account not found'
    return response
  }

  const expectedMetaId = crypto.hash(DAO_PROPOSALS_META_ID_STRING)
  if (tx.metaId !== expectedMetaId) {
    response.reason = 'tx "metaId" does not match the DAO proposals meta account address'
    return response
  }

  const nextCount = meta.count + 1
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

  if (tx.gracePeriod > daoParams.graceDuration) {
    response.reason = `tx "gracePeriod" (${tx.gracePeriod}ms) exceeds the maximum allowed grace duration (${daoParams.graceDuration}ms)`
    return response
  }

  // Double-guard: confirm every change key exists in the authoritative account state.
  // For governance/economic this is a second check (first was in validate_fields against the
  // cached account); for protocol it is the only check since dapp is not available in validate_fields.
  const payload = tx[tx.proposalType as 'governance' | 'economic' | 'protocol']
  if (payload) {
    for (const change of payload.changes) {
      let existing: unknown
      if (tx.proposalType === 'governance') {
        existing = (network.current.dao as any)[change.key]
      } else if (tx.proposalType === 'economic') {
        existing = (network.current as any)[change.key]
      } else {
        existing = (dapp.config as any)[change.key]
      }
      if (existing === undefined) {
        response.reason = `key "${change.key}" does not exist in ${tx.proposalType} parameters`
        return response
      }
      // Economic proposals may only modify scalar fields; the nested "dao" sub-object is governed
      // exclusively by governance proposals. Mirror the guard in dao_apply_parameters.validate()
      // so an invalid proposal is caught at creation time, not only at apply time.
      if (tx.proposalType === 'economic' && typeof existing === 'object' && existing !== null && !Array.isArray(existing)) {
        response.reason = `key "${change.key}" is an object parameter; economic proposals can only modify scalar fields`
        return response
      }
    }
  }

  const proposalFeeWei = utils.usdStrToWei(daoParams.proposalFeeUsdStr, network)
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
  const network: NetworkAccount = wrappedStates[config.networkAccount].data as unknown as NetworkAccount
  const from: UserAccount = wrappedStates[tx.from].data as unknown as UserAccount
  const meta: DaoProposalsMeta = wrappedStates[tx.metaId].data as unknown as DaoProposalsMeta
  const proposal: DaoProposalAccount = wrappedStates[tx.proposalId].data as unknown as DaoProposalAccount

  const daoParams = network.current.dao
  const proposalFeeWei = utils.usdStrToWei(daoParams.proposalFeeUsdStr, network)
  const txFeeWei = utils.getTransactionFeeWei(AccountsStorage.cachedNetworkAccount)

  // Deduct fees
  from.data.balance = SafeBigIntMath.subtract(from.data.balance, proposalFeeWei)
  from.data.balance = SafeBigIntMath.subtract(from.data.balance, txFeeWei)
  from.data.balance = SafeBigIntMath.subtract(from.data.balance, utils.maintenanceAmount(txTimestamp, from, network))

  // Increment proposal counter
  meta.count += 1

  // Build the proposal
  proposal.number = meta.count
  proposal.emergency = tx.emergency
  proposal.proposalType = tx.proposalType
  proposal.creationTime = txTimestamp
  // startTime defaults to creationTime when omitted. All phase boundaries (reviewEnd,
  // votingStart, votingEnd, claimEnd, applyEligibleAt) are derived from startTime + the
  // duration snapshots below; see getReviewEnd/getVotingStart/etc in daoProposalAccount.ts.
  proposal.startTime = tx.startTime ?? txTimestamp
  proposal.description = tx.description
  proposal.options = tx.options
  proposal.totalVote = tx.options.map(() => 0n)
  proposal.voterRewardPool = 0n // fee added only when proposal reaches voting
  proposal.committeeVotes = []
  proposal.voterList = []
  proposal.claimList = []
  proposal.gracePeriod = tx.gracePeriod

  // Snapshot DAO params at creation time
  proposal.proposalFeeWei = proposalFeeWei
  proposal.voteThresholdWei = utils.usdStrToWei(daoParams.voteThresholdUsdStr, network)
  proposal.minimumSpendWei = utils.usdStrToWei(daoParams.minimumSpendUsdStr, network)
  proposal.voteExponent = daoParams.voteExponent
  proposal.pctBurned = daoParams.pctBurned
  proposal.reviewDuration = daoParams.reviewDuration
  proposal.votingDuration = daoParams.votingDuration
  proposal.graceDuration = daoParams.graceDuration
  proposal.claimDuration = daoParams.claimDuration
  proposal.committeeAddresses = [...daoParams.committeeAddresses]

  // Set type-specific payload
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
    additionalInfo: { proposalNumber: meta.count, emergency: tx.emergency },
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
