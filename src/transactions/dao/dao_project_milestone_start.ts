import * as crypto from '../../crypto'
import { Shardus, ShardusTypes } from '@shardus/core'
import * as config from '../../config'
import { UserAccount, WrappedStates, Tx, AppReceiptData, DaoProposalAccount } from '../../@types'
import { SafeBigIntMath } from '../../utils/safeBigIntMath'
import * as AccountsStorage from '../../storage/accountStorage'
import * as utils from '../../utils'
import { appendProjectLog } from '../../utils/daoProjectLog'
import { planMilestoneTimeEndorsement } from '../../utils/daoProjectEndorsement'
import { canStartMilestone, findNextPendingMilestone } from '../../utils/daoProjectMilestoneState'
import { loadProjectTxContext } from '../../utils/daoProjectTxContext'

export const validate_fields = (tx: Tx.DaoProjectMilestoneStart, response: ShardusTypes.IncomingTransactionResult): ShardusTypes.IncomingTransactionResult => {
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
  tx: Tx.DaoProjectMilestoneStart,
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
    response.reason = `Project is not in executing status (current: ${proposal.status})`
    return response
  }

  // The policy says "start the next milestone", so the sender does not name one. Derived from
  // wrappedStates, which Shardus snapshots identically for every node.
  const next = findNextPendingMilestone(project)
  if (next.error) {
    response.reason = next.error
    return response
  }
  const { milestone, index: milestoneIndex } = next

  const orderError = canStartMilestone(project, milestoneIndex)
  if (orderError) {
    response.reason = orderError
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
  tx: Tx.DaoProjectMilestoneStart,
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
  const { milestone, index: milestoneIndex } = findNextPendingMilestone(project)
  const milestoneNumber = milestoneIndex + 1

  const txFeeWei = utils.getTransactionFeeWei(AccountsStorage.cachedNetworkAccount)
  from.data.balance = SafeBigIntMath.subtract(from.data.balance, txFeeWei)

  // Decide first, then apply what comes back. validate() ran the same call against the same
  // wrappedStates, so an error here means the two disagreed — throwing keeps a half-applied
  // endorsement out of consensus state.
  const result = planMilestoneTimeEndorsement(tx, proposal.committeeAddresses, project.address, milestone)
  if (result.error) throw new Error(`dao_project_milestone_start endorsement failed after validation: ${result.error}`)
  milestone.proposedTime = result.nextProposedTime
  milestone.endorsedTime = result.nextEndorsements

  if (result.committed) {
    milestone.startTime = milestone.proposedTime
    milestone.status = 'executing'
    // Cleared so the same two fields can carry the end-time question next, with no endorsements
    // inherited from the start.
    milestone.proposedTime = undefined
    milestone.endorsedTime = []
  }

  appendProjectLog(
    project,
    tx.from,
    txTimestamp,
    'dao_project_milestone_start',
    // milestoneNumber is derived rather than sent, but an audit entry that cannot say which
    // milestone was acted on is not much of an audit entry.
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

  dapp.log('Applied dao_project_milestone_start tx', from.id, tx.proposalId, milestoneNumber)
}

export const createFailedAppReceiptData = (
  tx: Tx.DaoProjectMilestoneStart,
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

export const keys = (tx: Tx.DaoProjectMilestoneStart, result: ShardusTypes.TransactionKeys): ShardusTypes.TransactionKeys => {
  result.sourceKeys = [tx.from]
  result.targetKeys = [tx.proposalId]
  result.allKeys = [...result.sourceKeys, ...result.targetKeys]
  return result
}

export const memoryPattern = (tx: Tx.DaoProjectMilestoneStart): ShardusTypes.ShardusMemoryPatternsInput => {
  return { rw: [tx.from, tx.proposalId], wo: [], on: [], ri: [], ro: [] }
}

export const createRelevantAccount = (
  dapp: Shardus,
  account: UserAccount | DaoProposalAccount,
  accountId: string,
  tx: Tx.DaoProjectMilestoneStart,
  accountCreated = false,
): ShardusTypes.WrappedResponse => {
  if (!account) {
    throw new Error(`dao_project_milestone_start.createRelevantAccount: account ${accountId} does not exist`)
  }
  return dapp.createWrappedResponse(accountId, accountCreated, account.hash, account.timestamp, account)
}
