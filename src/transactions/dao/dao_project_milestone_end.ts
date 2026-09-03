import * as crypto from '../../crypto'
import { Shardus, ShardusTypes } from '@shardus/core'
import * as config from '../../config'
import { UserAccount, WrappedStates, Tx, AppReceiptData, DaoProposalAccount } from '../../@types'
import { SafeBigIntMath } from '../../utils/safeBigIntMath'
import * as AccountsStorage from '../../storage/accountStorage'
import * as utils from '../../utils'
import { appendProjectLog } from '../../utils/daoProjectLog'
import { planMilestoneTimeEndorsement } from '../../utils/daoProjectEndorsement'
import { findExecutingMilestone } from '../../utils/daoProjectMilestoneState'
import { loadProjectTxContext } from '../../utils/daoProjectTxContext'

export const validate_fields = (tx: Tx.DaoProjectMilestoneEnd, response: ShardusTypes.IncomingTransactionResult): ShardusTypes.IncomingTransactionResult => {
  if (utils.isValidAddress(tx.from) === false) {
    response.reason = 'tx "from" is not a valid address'
    return response
  }
  if (utils.isValidAddress(tx.proposalId) === false) {
    response.reason = 'tx "proposalId" is not a valid address'
    return response
  }
  if (tx.proposedTime !== undefined) {
    if (typeof tx.proposedTime !== 'number' || !Number.isFinite(tx.proposedTime) || tx.proposedTime <= 0) {
      response.reason = 'tx "proposedTime" must be a positive finite number if provided'
      return response
    }
    // A start time in the future would let a milestone claim a duration it has not served.
    if (tx.proposedTime > tx.timestamp) {
      response.reason = `tx "proposedTime" (${tx.proposedTime}) cannot be later than the transaction time (${tx.timestamp})`
      return response
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
  tx: Tx.DaoProjectMilestoneEnd,
  wrappedStates: WrappedStates,
  response: ShardusTypes.IncomingTransactionResult,
): ShardusTypes.IncomingTransactionResult => {
  const ctx = loadProjectTxContext(wrappedStates, tx.from, tx.proposalId)
  if (ctx.error) {
    response.reason = ctx.error
    return response
  }
  const { from, proposal, project } = ctx

  if (proposal.status !== 'executing') {
    response.reason = `Project is not executing (current: ${proposal.status})`
    return response
  }

  // The policy says "end the current milestone". At most one can be executing, since a milestone
  // cannot start while an earlier one is unfinished, so this resolves unambiguously.
  const current = findExecutingMilestone(project)
  if (current.error) {
    response.reason = current.error
    return response
  }
  const { milestone } = current
  // An end before the start would produce a negative duration and invert the bonus/penalty test.
  if (tx.proposedTime !== undefined && milestone.startTime !== undefined && tx.proposedTime < milestone.startTime) {
    response.reason = `tx "proposedTime" (${tx.proposedTime}) cannot be earlier than the milestone start (${milestone.startTime})`
    return response
  }

  // The same call apply() makes, so the two cannot disagree about what this transaction does.
  // Nothing is mutated here: the plan is discarded and recomputed in apply().
  const plan = planMilestoneTimeEndorsement(tx, proposal.committeeAddresses, project.address, milestone)
  if (plan.error) {
    response.reason = plan.error
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
  tx: Tx.DaoProjectMilestoneEnd,
  txTimestamp: number,
  txId: string,
  wrappedStates: WrappedStates,
  dapp: Shardus,
  applyResponse: ShardusTypes.ApplyResponse,
): void => {
  const from = wrappedStates[tx.from].data as UserAccount
  const proposal = wrappedStates[tx.proposalId].data as DaoProposalAccount
  const project = proposal.project
  // Re-derived rather than carried from validate(), so apply() depends only on wrappedStates —
  // the snapshot Shardus gives both, so the two cannot resolve to different milestones. validate()
  // has already rejected the no-match case, which is why this destructure is not re-checked.
  const { milestone, index: milestoneIndex } = findExecutingMilestone(project)
  const milestoneNumber = milestoneIndex + 1

  const txFeeWei = utils.getTransactionFeeWei(AccountsStorage.cachedNetworkAccount)
  from.data.balance = SafeBigIntMath.subtract(from.data.balance, txFeeWei)

  // Decide first, then apply what comes back. validate() ran the same call against the same
  // wrappedStates, so an error here means the two disagreed — throwing keeps a half-applied
  // endorsement out of consensus state.
  const result = planMilestoneTimeEndorsement(tx, proposal.committeeAddresses, project.address, milestone)
  if (result.error) throw new Error(`dao_project_milestone_end endorsement failed after validation: ${result.error}`)
  milestone.proposedTime = result.nextProposedTime
  milestone.endorsedTime = result.nextEndorsements

  if (result.committed) {
    milestone.endTime = milestone.proposedTime
    milestone.status = 'completed'
    // Cleared on commit like the start was, so nothing carries into a later question about this
    // milestone and the fields are unambiguous for the next one.
    milestone.proposedTime = undefined
    milestone.endorsedTime = []
    // Abandoned termination intent must not linger on a finished milestone, where it could later
    // reach the threshold and terminate work that was already accepted and paid for.
    milestone.terminateVotes = []
  }

  appendProjectLog(
    project,
    tx.from,
    txTimestamp,
    'dao_project_milestone_end',
    tx.proposedTime === undefined ? { milestoneNumber } : { milestoneNumber, proposedTime: tx.proposedTime },
  )

  from.timestamp = txTimestamp
  proposal.timestamp = txTimestamp

  const appReceiptData: AppReceiptData = {
    txId,
    timestamp: txTimestamp,
    success: true,
    from: from.id,
    to: proposal.id,
    type: tx.type,
    transactionFee: txFeeWei,
    additionalInfo: {
      milestoneNumber,
      milestoneStatus: milestone.status,
      endorsements: milestone.endorsedTime.length,
      committed: result.committed === true,
    },
  }
  const appReceiptDataHash = crypto.hashObj(appReceiptData)
  dapp.applyResponseAddReceiptData(applyResponse, appReceiptData, appReceiptDataHash)

  dapp.log('Applied dao_project_milestone_end tx', from.id, tx.proposalId, milestoneNumber)
}

export const createFailedAppReceiptData = (
  tx: Tx.DaoProjectMilestoneEnd,
  txTimestamp: number,
  txId: string,
  wrappedStates: WrappedStates,
  dapp: Shardus,
  applyResponse: ShardusTypes.ApplyResponse,
  reason: string,
): void => {
  // A failed transaction still costs its sender the fee, or their whole balance if it is smaller —
  // otherwise failing is free and can be repeated without cost.
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

export const keys = (tx: Tx.DaoProjectMilestoneEnd, result: ShardusTypes.TransactionKeys): ShardusTypes.TransactionKeys => {
  result.sourceKeys = [tx.from]
  result.targetKeys = [tx.proposalId]
  result.allKeys = [...result.sourceKeys, ...result.targetKeys]
  return result
}

export const memoryPattern = (tx: Tx.DaoProjectMilestoneEnd): ShardusTypes.ShardusMemoryPatternsInput => {
  return { rw: [tx.from, tx.proposalId], wo: [], on: [], ri: [], ro: [] }
}

export const createRelevantAccount = (
  dapp: Shardus,
  account: UserAccount | DaoProposalAccount,
  accountId: string,
  tx: Tx.DaoProjectMilestoneEnd,
  accountCreated = false,
): ShardusTypes.WrappedResponse => {
  if (!account) {
    throw new Error(`dao_project_milestone_end.createRelevantAccount: account ${accountId} does not exist`)
  }
  return dapp.createWrappedResponse(accountId, accountCreated, account.hash, account.timestamp, account)
}
