import * as crypto from '../../crypto'
import { Shardus, ShardusTypes } from '@shardus/core'
import * as config from '../../config'
import { UserAccount, WrappedStates, Tx, AppReceiptData, DaoProposalAccount } from '../../@types'
import { SafeBigIntMath } from '../../utils/safeBigIntMath'
import * as AccountsStorage from '../../storage/accountStorage'
import * as utils from '../../utils'
import { isUserAccount, isDaoProposalAccount } from '../../@types/accountTypeGuards'

export const validate_fields = (
  tx: Tx.DaoUnapplyParameters,
  response: ShardusTypes.IncomingTransactionResult,
): ShardusTypes.IncomingTransactionResult => {
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
  tx: Tx.DaoUnapplyParameters,
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
  if (proposal.status !== 'applied') {
    response.reason = `Proposal is not in applied status (current: ${proposal.status})`
    return response
  }
  if (!['governance', 'economic', 'protocol'].includes(proposal.proposalType)) {
    response.reason = `Proposal type "${proposal.proposalType}" does not support parameter unapply`
    return response
  }
  if (!proposal.committeeAddresses.includes(tx.from)) {
    response.reason = 'Only a committee member can submit dao_unapply_parameters'
    return response
  }
  // Lazily created — most proposals never reach 'applied' and never need this field.
  const unapplyVotes = Array.isArray(proposal.unapplyVotes) ? proposal.unapplyVotes : []
  if (unapplyVotes.includes(tx.from)) {
    response.reason = 'Committee member has already submitted unapply for this proposal'
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
  tx: Tx.DaoUnapplyParameters,
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

  // Created here on first use rather than defaulted at proposal-creation time.
  const unapplyVotes = Array.isArray(proposal.unapplyVotes) ? proposal.unapplyVotes : []
  unapplyVotes.push(tx.from)
  proposal.unapplyVotes = unapplyVotes

  // Validate rather than clamp: a bogus 0 must not collapse to 1 and flip on the first vote —
  // this value is consensus-relevant, so it needs a sane fallback, not a naive Math.max.
  const committeeSize = proposal.committeeAddresses.length
  const configuredThreshold = config.LiberdusFlags.daoUnapplyCommitteeThreshold
  const baseThreshold = Number.isSafeInteger(configuredThreshold) && configuredThreshold > 0 ? configuredThreshold : 3
  const threshold = Math.min(baseThreshold, committeeSize)

  // Dedupe via Set so a stray duplicate entry can't inflate the count past the guard.
  const snapshotCommittee = new Set(proposal.committeeAddresses)
  const unapplyVoteCount = new Set(unapplyVotes.filter((a) => snapshotCommittee.has(a))).size

  // Capture before reset so the threshold-reaching tx reports the true count, not 0.
  const thresholdReached = unapplyVoteCount >= threshold
  if (thresholdReached) {
    proposal.status = 'accepted'
    proposal.unapplyVotes = []
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
    additionalInfo: { unapplyVoteCount, thresholdReached, proposalStatus: proposal.status },
  }
  const appReceiptDataHash = crypto.hashObj(appReceiptData)
  dapp.applyResponseAddReceiptData(applyResponse, appReceiptData, appReceiptDataHash)
  dapp.log('Applied dao_unapply_parameters tx', tx.from, tx.proposalId, unapplyVoteCount, proposal.status)
}

export const createFailedAppReceiptData = (
  tx: Tx.DaoUnapplyParameters,
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

export const keys = (tx: Tx.DaoUnapplyParameters, result: ShardusTypes.TransactionKeys): ShardusTypes.TransactionKeys => {
  result.sourceKeys = [tx.from]
  result.targetKeys = [tx.proposalId]
  result.allKeys = [...result.sourceKeys, ...result.targetKeys]
  return result
}

export const memoryPattern = (tx: Tx.DaoUnapplyParameters, result: ShardusTypes.TransactionKeys): ShardusTypes.ShardusMemoryPatternsInput => {
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
  tx: Tx.DaoUnapplyParameters,
  accountCreated = false,
): ShardusTypes.WrappedResponse => {
  if (!account) {
    throw new Error(`dao_unapply_parameters.createRelevantAccount: account ${accountId} does not exist`)
  }
  return dapp.createWrappedResponse(accountId, accountCreated, account.hash, account.timestamp, account)
}
