import * as crypto from '../../crypto'
import { Shardus, ShardusTypes } from '@shardus/core'
import * as utils from '../../utils'
import create from '../../accounts'
import * as config from '../../config'
import { UserAccount, NetworkAccount, WrappedStates, Tx, AppReceiptData, DaoProposalsMeta, DaoProposalAccount, DaoProposalStatus } from '../../@types'
import { SafeBigIntMath } from '../../utils/safeBigIntMath'
import * as AccountsStorage from '../../storage/accountStorage'
import { isUserAccount, isDaoProposalsMeta, isDaoProposalAccount } from '../../@types/accountTypeGuards'
import { DAO_PROPOSALS_META_ID_STRING } from '../../accounts/daoProposalsMetaAccount'
import { findMissingProposalNumbers, getProposalIndex, recordProposalStatus } from '../../utils/daoProposalIndex'
import { validateDaoOptions } from '../../utils/daoBallotOptions'
import { validateProposalChangeSets } from '../../utils/daoProposalChangeSets'

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
  if (typeof tx.title !== 'string' || tx.title.trim().length === 0 || tx.title.length > 100) {
    response.reason = 'tx "title" must be a non-empty string of at most 100 characters'
    return response
  }
  if (typeof tx.description !== 'string' || tx.description.length === 0 || tx.description.length > 10000) {
    response.reason = 'tx "description" must be a non-empty string of at most 10000 characters'
    return response
  }
  const optionsError = validateDaoOptions(tx.options)
  if (optionsError) {
    response.reason = optionsError
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
  const changesError = validateProposalChangeSets(tx.proposalType, tx.options, payload?.changes ?? [], AccountsStorage.cachedNetworkAccount, dapp, tx.emergency)
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
  const changesError = validateProposalChangeSets(tx.proposalType, tx.options, txPayload?.changes ?? [], network, dapp, tx.emergency)
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

/**
 * Fills historical proposals into the index until it is complete.
 *
 * Self-limiting: once every proposal 1..count-1 is present, findMissingProposalNumbers returns
 * empty and this becomes a no-op forever.
 *
 * KNOWN AND ACCEPTED: this makes apply() non-deterministic. Handlers normally derive state only
 * from wrappedStates, which Shardus snapshots identically for every node; a network fetch does not
 * have that property, because nodes hold different shards, query different peers, and time out
 * independently. If nodes compute different arrays they submit different
 * AppliedVote.account_state_hash_after values, no majority forms, and the transaction fails
 * consensus. That is a reliability cost, not a safety one — committed state stays consistent and
 * there is no fork; the visible symptom is dao_proposal_create failing and needing a retry.
 *
 * Two mitigations keep that tolerable, and both matter:
 *
 * - All-or-nothing. A partially applied batch would give every node a different array; abandoning
 *   the whole batch on any failure collapses the outcomes to exactly two (batch applied, or
 *   nothing), so a majority can still agree.
 * - Never wedge creation. The proposal being created is indexed before this runs, so a batch that
 *   cannot be fetched only delays historical entries — it never blocks new proposals.
 *
 * The fetches cannot hang apply() inside consensus, so no local timeout is added here (and
 * getLocalOrRemoteAccount exposes no timeout parameter to pass one through). Core already bounds
 * each call: stateManager.getLocalOrRemoteAccount reaches a remote node via p2p.askBinary, which
 * hands `network.timeout` (default 5s) to the socket send and rejects on expiry. Because
 * canThrowException defaults to false, state-manager swallows that rejection and returns null,
 * which the `!account` check below treats as a failed batch. The whole batch is issued concurrently,
 * so the worst case is one timeout of added latency however many accounts are missing.
 */
async function backfillProposalIndex(meta: DaoProposalsMeta, dapp: Shardus): Promise<void> {
  const missing = findMissingProposalNumbers(meta)
  if (missing.length === 0) return

  // Issued concurrently rather than one at a time, and as a single batch rather than chunks spread
  // over successive creations. Convergence is what that buys: a network upgrading with 40 existing
  // proposals fills its entire index on the first creation afterwards.
  //
  // Determinism survives this. Promise.all resolves in input order regardless of completion order,
  // so results map back to `missing` positionally, and recordProposalStatus sorts by the total order
  // in compareIndexEntries anyway — completion order is never observable in the output.
  //
  // Each fetch catches its own failure and yields null rather than rejecting, so one bad account
  // cannot leave the other promises unhandled, and every failure mode lands on the same null check.
  const wrapped = await Promise.all(
    missing.map(async (proposalNumber) => {
      try {
        return await dapp.getLocalOrRemoteAccount(crypto.hash(`dao proposal #${proposalNumber}`))
      } catch (err) {
        dapp.log('dao_proposal_create: backfill fetch threw', proposalNumber, err)
        return null
      }
    }),
  )

  const entries: Array<{ proposal: number; status: DaoProposalStatus; emergency: boolean; timestamp: number }> = []
  for (let i = 0; i < missing.length; i++) {
    const account = wrapped[i]?.data as DaoProposalAccount
    if (!account || !isDaoProposalAccount(account)) {
      // All-or-nothing: one unreachable account abandons the whole batch rather than writing a
      // partial array that no two nodes would agree on. The next creation retries.
      dapp.log('dao_proposal_create: backfill could not read proposal, skipping batch', missing[i])
      return
    }
    // proposal.timestamp means "last touched by any tx", not "last status change" — several
    // handlers bump it without changing status. Backfilled timestamps are therefore approximate,
    // which is accepted; it is the only timestamp reachable from the account and it is
    // deterministic, so every node that reads the account agrees on it.
    // Keyed on the requested number, not account.number: the address was derived from it, so it is
    // the authoritative identity for this entry regardless of what the fetched body says.
    entries.push({ proposal: missing[i], status: account.status, emergency: account.emergency, timestamp: account.timestamp })
  }

  // Apply only after every fetch in the batch succeeded.
  for (const entry of entries) {
    recordProposalStatus(meta, entry.proposal, entry.status, entry.emergency, entry.timestamp)
  }
  // Note: recordProposalStatus stamps meta.timestamp with each entry's timestamp, which here is
  // historical. apply() reassigns meta.timestamp = txTimestamp after this returns, which is what
  // keeps the account emitted as changed — src/index.ts only persists accounts whose timestamp
  // equals txTimestamp. Do not reorder that assignment above this call.
  dapp.log('dao_proposal_create: backfilled proposal index entries', entries.length, 'of', getProposalIndex(meta).length)
}

export const apply = async (
  tx: Tx.DaoProposalCreate,
  txTimestamp: number,
  txId: string,
  wrappedStates: WrappedStates,
  dapp: Shardus,
  applyResponse: ShardusTypes.ApplyResponse,
): Promise<void> => {
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
  proposal.title = tx.title.trim()
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

  // A newly created proposal is always a real transition, so no previousStatus guard is needed
  // here. Crucially this runs BEFORE the backfill and never depends on a fetch, so a failing
  // backfill can never stop the proposal being created from reaching the index.
  recordProposalStatus(meta, proposal.number, proposal.status, proposal.emergency, txTimestamp)

  await backfillProposalIndex(meta, dapp)

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
