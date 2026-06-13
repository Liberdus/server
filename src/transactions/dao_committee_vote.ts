import * as crypto from '../crypto'
import { Shardus, ShardusTypes } from '@shardus/core'
import { UserAccount, WrappedStates, Tx, AppReceiptData, DaoProposalAccount } from '../@types'
import { SafeBigIntMath } from '../utils/safeBigIntMath'
import * as AccountsStorage from '../storage/accountStorage'
import * as utils from '../utils'
import { isUserAccount, isDaoProposalAccount } from '../@types/accountTypeGuards'
import { LiberdusFlags } from '../config'
import { getReviewEnd } from '../accounts/daoProposalAccount'

export const validate_fields = (tx: Tx.DaoCommitteeVote, response: ShardusTypes.IncomingTransactionResult): ShardusTypes.IncomingTransactionResult => {
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
  if (tx.vote !== 'accept' && tx.vote !== 'withhold') {
    response.reason = 'tx "vote" must be "accept" or "withhold"'
    return response
  }
  // withheldReason is required (non-empty) when voting to withhold.
  if (tx.vote === 'withhold') {
    if (typeof tx.withheldReason !== 'string' || tx.withheldReason.trim().length === 0) {
      response.reason = 'tx "withheldReason" is required and must be a non-empty string when vote is "withhold"'
      return response
    }
  } else if (tx.withheldReason !== undefined && typeof tx.withheldReason !== 'string') {
    response.reason = 'tx "withheldReason" must be a string if provided'
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
  tx: Tx.DaoCommitteeVote,
  wrappedStates: WrappedStates,
  response: ShardusTypes.IncomingTransactionResult,
  dapp: Shardus,
): ShardusTypes.IncomingTransactionResult => {
  const from: UserAccount = wrappedStates[tx.from] && (wrappedStates[tx.from].data as unknown as UserAccount)
  const proposal: DaoProposalAccount = wrappedStates[tx.proposalId] && (wrappedStates[tx.proposalId].data as unknown as DaoProposalAccount)

  if (!from || !isUserAccount(from)) {
    response.reason = 'from account not found or is not a UserAccount'
    return response
  }
  if (!proposal || !isDaoProposalAccount(proposal)) {
    response.reason = 'Proposal account not found or is not a DaoProposalAccount'
    return response
  }
  if (proposal.status !== 'review') {
    response.reason = `Proposal is not in review status (current: ${proposal.status})`
    return response
  }
  // Lower bound: startTime gives the committee lead time before review actually opens
  // ("there can be some time before the committee can vote on the proposal" — policy).
  // Without this check a committee member could vote during that lead-time gap, before
  // the nominal review window (and therefore the derived votingStart) has even begun.
  if (tx.timestamp < proposal.startTime) {
    response.reason = 'Committee review period has not started yet'
    return response
  }
  if (tx.timestamp > getReviewEnd(proposal)) {
    response.reason = 'Committee review period has ended'
    return response
  }
  if (!proposal.committeeAddresses.includes(tx.from)) {
    response.reason = 'tx sender is not a committee member'
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
  tx: Tx.DaoCommitteeVote,
  txTimestamp: number,
  txId: string,
  wrappedStates: WrappedStates,
  dapp: Shardus,
  applyResponse: ShardusTypes.ApplyResponse,
): void => {
  const from: UserAccount = wrappedStates[tx.from].data as unknown as UserAccount
  const proposal: DaoProposalAccount = wrappedStates[tx.proposalId].data as unknown as DaoProposalAccount
  const txFeeWei = utils.getTransactionFeeWei(AccountsStorage.cachedNetworkAccount)

  from.data.balance = SafeBigIntMath.subtract(from.data.balance, txFeeWei)

  // Replace this member's current vote (rather than append) — a member can change their mind
  // during review; keying by memberAddress means withheldReason always stays attributed to
  // their *current* vote, with no stale/orphaned reasons left behind from a prior selection.
  proposal.committeeVotes = proposal.committeeVotes.filter((v) => v.memberAddress !== tx.from)
  proposal.committeeVotes.push({
    memberAddress: tx.from,
    vote: tx.vote,
    withheldReason: tx.vote === 'withhold' ? tx.withheldReason : undefined,
  })

  // Use the committee snapshot taken at proposal creation (proposal.committeeAddresses), not
  // the live network committee — the committee authoritative for this proposal's quorum/
  // decisiveness math is the one in effect when the proposal was created, even if a governance
  // proposal changes committeeAddresses mid-review.
  // Votes from members who are not part of that snapshot are excluded — otherwise stale/foreign
  // votes could produce phantom decisiveness.
  const snapshotCommittee = new Set(proposal.committeeAddresses)
  const committeeSize = proposal.committeeAddresses.length
  const acceptCount = proposal.committeeVotes.filter((v) => v.vote === 'accept' && snapshotCommittee.has(v.memberAddress)).length
  const withholdCount = proposal.committeeVotes.filter((v) => v.vote === 'withhold' && snapshotCommittee.has(v.memberAddress)).length

  // Decisive means the result cannot change even if all remaining members vote the other way
  const remainingVotes = committeeSize - acceptCount - withholdCount
  const acceptDecisive = acceptCount > withholdCount + remainingVotes
  const withholdDecisive = withholdCount > acceptCount + remainingVotes

  // Only emergency proposals transition early on a decisive committee vote. Regular
  // proposals never change status mid-review — per policy, "the user voting does not start
  // until the review period is over" even once a result is decisive — so dao_committee_result
  // (after reviewEnd) is the sole place a regular proposal's status is decided.
  if (proposal.emergency) {
    if (withholdDecisive) {
      proposal.status = 'withheld'
      // Proposal fee (seeded into voterRewardPool at creation) is burned on withhold.
      proposal.initialBurnedReward = proposal.voterRewardPool
      proposal.voterRewardPool = 0n
    } else if (acceptDecisive) {
      // Emergency proposals skip community voting and are accepted immediately on a decisive
      // accept. All phase boundaries (votingStart/votingEnd/claimEnd) remain fully derived
      // from startTime (see getVotingEnd/getClaimEnd) — "emergency" speeds up the *decision*,
      // not the nominal voting schedule. Emergency proposals are exempt from the proposal fee,
      // so voterRewardPool stays 0; with no community voters, claimedReward stays 0 too, and
      // dao_burn_reward after claimEnd has nothing to burn ("Nothing left to burn").
      proposal.status = 'accepted'
    }
  }

  from.timestamp = txTimestamp
  proposal.timestamp = txTimestamp

  const appReceiptData: AppReceiptData = {
    txId,
    timestamp: txTimestamp,
    success: true,
    from: tx.from,
    to: tx.proposalId,
    type: tx.type,
    transactionFee: txFeeWei,
    additionalInfo: { vote: tx.vote, newStatus: proposal.status },
  }
  const appReceiptDataHash = crypto.hashObj(appReceiptData)
  dapp.applyResponseAddReceiptData(applyResponse, appReceiptData, appReceiptDataHash)
  dapp.log('Applied dao_committee_vote tx', tx.from, tx.proposalId, tx.vote, proposal.status)
}

export const createFailedAppReceiptData = (
  tx: Tx.DaoCommitteeVote,
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

export const keys = (tx: Tx.DaoCommitteeVote, result: ShardusTypes.TransactionKeys): ShardusTypes.TransactionKeys => {
  result.sourceKeys = [tx.from]
  result.targetKeys = [tx.proposalId]
  result.allKeys = [...result.sourceKeys, ...result.targetKeys]
  return result
}

export const memoryPattern = (tx: Tx.DaoCommitteeVote, result: ShardusTypes.TransactionKeys): ShardusTypes.ShardusMemoryPatternsInput => {
  return {
    rw: [tx.from, tx.proposalId],
    wo: [],
    on: [],
    ri: [],
    ro: [],
  }
}

export const createRelevantAccount = (
  dapp: Shardus,
  account: UserAccount | DaoProposalAccount,
  accountId: string,
  tx: Tx.DaoCommitteeVote,
  accountCreated = false,
): ShardusTypes.WrappedResponse => {
  if (!account) {
    throw new Error(`dao_committee_vote.createRelevantAccount: account ${accountId} does not exist`)
  }
  return dapp.createWrappedResponse(accountId, accountCreated, account.hash, account.timestamp, account)
}
