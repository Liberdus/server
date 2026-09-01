import * as crypto from '../../crypto'
import { Shardus, ShardusTypes } from '@shardus/core'
import * as config from '../../config'
import { UserAccount, WrappedStates, Tx, AppReceiptData, DaoProposalAccount, NetworkAccount } from '../../@types'
import { SafeBigIntMath } from '../../utils/safeBigIntMath'
import * as AccountsStorage from '../../storage/accountStorage'
import * as utils from '../../utils'
import { appendProjectLog } from '../../utils/daoProjectLog'
import { requiredEndorsements } from '../../utils/daoProjectEndorsement'
import { loadProjectTxContext } from '../../utils/daoProjectTxContext'

export const validate_fields = (
  tx: Tx.DaoProjectMilestoneTerminate,
  response: ShardusTypes.IncomingTransactionResult,
): ShardusTypes.IncomingTransactionResult => {
  if (utils.isValidAddress(tx.from) === false) {
    response.reason = 'tx "from" is not a valid address'
    return response
  }
  if (utils.isValidAddress(tx.proposalId) === false) {
    response.reason = 'tx "proposalId" is not a valid address'
    return response
  }
  if (typeof tx.milestoneNumber !== 'number' || !Number.isInteger(tx.milestoneNumber) || tx.milestoneNumber < 1) {
    response.reason = 'tx "milestoneNumber" must be a positive integer'
    return response
  }
  // The policy requires a reason on every termination submission — it is the record of why the DAO
  // stopped paying for work, and the log is what a dispute would be argued from.
  if (typeof tx.reason !== 'string' || tx.reason.trim().length === 0 || tx.reason.length > 500) {
    response.reason = 'tx "reason" must be a non-empty string of at most 500 characters'
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
  tx: Tx.DaoProjectMilestoneTerminate,
  wrappedStates: WrappedStates,
  response: ShardusTypes.IncomingTransactionResult,
): ShardusTypes.IncomingTransactionResult => {
  const ctx = loadProjectTxContext(wrappedStates, tx.from, tx.proposalId, tx.milestoneNumber)
  if (ctx.error) {
    response.reason = ctx.error
    return response
  }
  const { from, proposal, project, milestone } = ctx

  // A milestone can be abandoned before or during work, but not after it has already resolved.
  if (milestone.status !== 'pending' && milestone.status !== 'executing') {
    response.reason = `Milestone ${tx.milestoneNumber} cannot be terminated (current: ${milestone.status})`
    return response
  }
  // Committee only — unlike start and end, the contractor has no say in abandoning their own work.
  if (!proposal.committeeAddresses.includes(tx.from)) {
    response.reason = 'Only a committee member can terminate a milestone'
    return response
  }
  if (milestone.terminateVotes.some((v) => v.address === tx.from)) {
    response.reason = 'This address has already voted to terminate this milestone'
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
  tx: Tx.DaoProjectMilestoneTerminate,
  txTimestamp: number,
  txId: string,
  wrappedStates: WrappedStates,
  dapp: Shardus,
  applyResponse: ShardusTypes.ApplyResponse,
): void => {
  const from = wrappedStates[tx.from].data as UserAccount
  const proposal = wrappedStates[tx.proposalId].data as DaoProposalAccount
  const network = wrappedStates[config.networkAccount].data as NetworkAccount
  const project = proposal.project
  const milestone = project.milestones[tx.milestoneNumber - 1]

  const txFeeWei = utils.getTransactionFeeWei(AccountsStorage.cachedNetworkAccount)
  from.data.balance = SafeBigIntMath.subtract(from.data.balance, txFeeWei)

  milestone.terminateVotes.push({ address: tx.from, reason: tx.reason, timestamp: txTimestamp })

  // Committee-only, so the reachable maximum is the committee size — no contractor slot to allow for.
  const required = requiredEndorsements(proposal.committeeAddresses.length, false)
  const committed = milestone.terminateVotes.length >= required
  if (committed) {
    milestone.status = 'terminated'
    milestone.endTime = txTimestamp
    // The contractor can never claim this milestone, so the escrow held for it is released back out
    // of the project's balance. Mirrors what was minted for it: cost plus the early bonus.
    const releasedWei = utils.usdStrToWei(milestone.costUsdStr, network) + utils.usdStrToWei(milestone.bonusUsdStr, network)
    project.balance = SafeBigIntMath.subtract(project.balance, releasedWei)
    // Any pending start/end question on this milestone is moot now.
    milestone.proposedTime = undefined
    milestone.endorsedTime = []
  }

  appendProjectLog(
    project,
    tx.from,
    txTimestamp,
    'dao_project_milestone_terminate',
    `milestone=${tx.milestoneNumber} votes=${milestone.terminateVotes.length} committed=${committed} reason=${tx.reason}`,
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
      milestoneNumber: tx.milestoneNumber,
      milestoneStatus: milestone.status,
      terminateVotes: milestone.terminateVotes.length,
      committed,
    },
  }
  applyResponse.appReceiptDataHash = crypto.hashObj(appReceiptData)
  applyResponse.appReceiptData = appReceiptData

  dapp.log('Applied dao_project_milestone_terminate tx', from.id, tx.proposalId, tx.milestoneNumber)
}

export const createFailedAppReceiptData = (tx: Tx.DaoProjectMilestoneTerminate, txId: string, txTimestamp: number, reason: string): AppReceiptData => {
  return { txId, timestamp: txTimestamp, success: false, from: tx.from, to: tx.proposalId, type: tx.type, transactionFee: 0n, additionalInfo: { reason } }
}

export const keys = (tx: Tx.DaoProjectMilestoneTerminate, result: ShardusTypes.TransactionKeys): ShardusTypes.TransactionKeys => {
  result.sourceKeys = [tx.from]
  result.targetKeys = [tx.proposalId, config.networkAccount]
  result.allKeys = [...result.sourceKeys, ...result.targetKeys]
  return result
}

export const memoryPattern = (tx: Tx.DaoProjectMilestoneTerminate): ShardusTypes.ShardusMemoryPatternsInput => {
  return { rw: [tx.from, tx.proposalId], wo: [], on: [], ri: [], ro: [config.networkAccount] }
}

export const createRelevantAccount = (
  dapp: Shardus,
  account: UserAccount | DaoProposalAccount,
  accountId: string,
  tx: Tx.DaoProjectMilestoneTerminate,
  accountCreated = false,
): ShardusTypes.WrappedResponse => {
  if (!account) {
    throw new Error(`dao_project_milestone_terminate.createRelevantAccount: account ${accountId} does not exist`)
  }
  return dapp.createWrappedResponse(accountId, accountCreated, account.hash, account.timestamp, account)
}
