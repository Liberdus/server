import * as crypto from '../crypto'
import { Shardus, ShardusTypes } from '@shardus/core'
import create from '../accounts'
import * as config from '../config'
import { UserAccount, WrappedStates, Tx, AppReceiptData, DaoProposalAccount } from '../@types'
import { SafeBigIntMath } from '../utils/safeBigIntMath'
import * as AccountsStorage from '../storage/accountStorage'
import * as utils from '../utils'
import { isUserAccount, isDaoProposalAccount } from '../@types/accountTypeGuards'
import { LiberdusFlags } from '../config'
import { getReviewEnd } from '../accounts/daoProposalAccount'

export const validate_fields = (tx: Tx.DaoCommitteeResult, response: ShardusTypes.IncomingTransactionResult): ShardusTypes.IncomingTransactionResult => {
  if (!LiberdusFlags.enableNewDAOTransactions) {
    response.reason = 'New DAO transactions are not enabled'
    return response
  }
  if (utils.isValidAddress(tx.from) === false) {
    response.reason = 'tx "from" is not a valid address'
    return response
  }
  if (typeof tx.proposalId !== 'string' || tx.proposalId.length !== 64) {
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
  tx: Tx.DaoCommitteeResult,
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
  if (tx.timestamp <= getReviewEnd(proposal)) {
    response.reason = 'Committee review period has not ended yet'
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
  tx: Tx.DaoCommitteeResult,
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

  if (proposal.emergency) {
    // Emergency proposals: dao_committee_vote already flips status to 'accepted' the moment a
    // decisive accept is reached (and 'withheld' on a decisive withhold), so reaching this point
    // with status still 'review' means the committee never reached a decisive result before the
    // (nominal) review window elapsed — the proposal is withheld.
    proposal.status = 'withheld'
  } else {
    // Sole path from 'review' → 'voting' for regular proposals; dao_committee_vote never
    // flips status early regardless of outcome — voting always starts at reviewEnd.
    proposal.status = 'voting'
    proposal.voterRewardPool = proposal.proposalFeeWei
  }

  from.timestamp = txTimestamp
  proposal.timestamp = txTimestamp

  const appReceiptData: AppReceiptData = {
    txId,
    timestamp: txTimestamp,
    success: true,
    from: tx.from,
    type: tx.type,
    transactionFee: txFeeWei,
    additionalInfo: { proposalId: tx.proposalId, newStatus: proposal.status },
  }
  const appReceiptDataHash = crypto.hashObj(appReceiptData)
  dapp.applyResponseAddReceiptData(applyResponse, appReceiptData, appReceiptDataHash)
  dapp.log('Applied dao_committee_result tx', tx.proposalId, proposal.status)
}

export const createFailedAppReceiptData = (
  tx: Tx.DaoCommitteeResult,
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
    type: tx.type,
    transactionFee,
  }
  const appReceiptDataHash = crypto.hashObj(appReceiptData)
  dapp.applyResponseAddReceiptData(applyResponse, appReceiptData, appReceiptDataHash)
}

export const keys = (tx: Tx.DaoCommitteeResult, result: ShardusTypes.TransactionKeys): ShardusTypes.TransactionKeys => {
  result.sourceKeys = [tx.from]
  result.targetKeys = [tx.proposalId]
  result.allKeys = [...result.sourceKeys, ...result.targetKeys]
  return result
}

export const memoryPattern = (tx: Tx.DaoCommitteeResult, result: ShardusTypes.TransactionKeys): ShardusTypes.ShardusMemoryPatternsInput => {
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
  tx: Tx.DaoCommitteeResult,
  accountCreated = false,
): ShardusTypes.WrappedResponse => {
  if (!account) {
    account = create.userAccount(accountId, tx.timestamp)
    accountCreated = true
  }
  return dapp.createWrappedResponse(accountId, accountCreated, account.hash, account.timestamp, account)
}
