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
  if (tx.vote === 'withhold') {
    if (typeof tx.withheldReason !== 'string' || tx.withheldReason.trim().length === 0 || tx.withheldReason.length > 1000) {
      response.reason = 'tx "withheldReason" is required and must be a non-empty string of at most 1000 characters when vote is "withhold"'
      return response
    }
  } else if (tx.withheldReason !== undefined) {
    response.reason = 'tx "withheldReason" must not be provided when vote is "accept"'
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
  const from = wrappedStates[tx.from]?.data as UserAccount
  const proposal = wrappedStates[tx.proposalId]?.data as DaoProposalAccount

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
  // startTime is when review opens; votes before it (during the lead-time gap before review) are rejected.
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
  const from = wrappedStates[tx.from].data as UserAccount
  const proposal = wrappedStates[tx.proposalId].data as DaoProposalAccount
  const txFeeWei = utils.getTransactionFeeWei(AccountsStorage.cachedNetworkAccount)

  from.data.balance = SafeBigIntMath.subtract(from.data.balance, txFeeWei)

  // Replace any existing vote from this member — they can change their mind during review.
  proposal.committeeVotes = proposal.committeeVotes.filter((v) => v.memberAddress !== tx.from)
  proposal.committeeVotes.push({
    memberAddress: tx.from,
    vote: tx.vote,
    withheldReason: tx.vote === 'withhold' ? tx.withheldReason!.trim() : undefined,
  })

  // Use the committee snapshot from proposal creation, not the live network committee —
  // a governance proposal could change committeeAddresses mid-review.
  const snapshotCommittee = new Set(proposal.committeeAddresses)
  const committeeSize = proposal.committeeAddresses.length
  const acceptCount = proposal.committeeVotes.filter((v) => v.vote === 'accept' && snapshotCommittee.has(v.memberAddress)).length
  const withholdCount = proposal.committeeVotes.filter((v) => v.vote === 'withhold' && snapshotCommittee.has(v.memberAddress)).length

  // Decisive: result can't change even if all remaining members vote the other way.
  const remainingVotes = committeeSize - acceptCount - withholdCount
  const acceptDecisive = acceptCount > withholdCount + remainingVotes
  const withholdDecisive = withholdCount > acceptCount + remainingVotes

  // Only emergency proposals change status early on a decisive vote; regular proposals
  // wait until reviewEnd (handled by dao_committee_result).
  if (proposal.emergency) {
    if (withholdDecisive) {
      proposal.status = 'withheld'
      // Burn the voter reward pool on withhold (it was seeded from the proposal fee at creation).
      proposal.initialBurnedReward = proposal.voterRewardPool
      proposal.voterRewardPool = 0n
    } else if (acceptDecisive) {
      // Emergency proposals skip community voting and go straight to accepted.
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
    additionalInfo: { vote: tx.vote, proposalStatus: proposal.status },
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
