import * as crypto from '../../crypto'
import { Shardus, ShardusTypes } from '@shardus/core'
import * as config from '../../config'
import { UserAccount, WrappedStates, Tx, AppReceiptData, DaoProposalAccount } from '../../@types'
import { SafeBigIntMath } from '../../utils/safeBigIntMath'
import * as AccountsStorage from '../../storage/accountStorage'
import * as utils from '../../utils'
import { appendProjectLog } from '../../utils/daoProjectLog'
import { milestonePayoutWei, usdToWeiAtRate } from '../../utils/daoProjectPayout'
import { loadProjectTxContext } from '../../utils/daoProjectTxContext'

export const validate_fields = (tx: Tx.DaoProjectMilestoneClaim, response: ShardusTypes.IncomingTransactionResult): ShardusTypes.IncomingTransactionResult => {
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
  tx: Tx.DaoProjectMilestoneClaim,
  wrappedStates: WrappedStates,
  response: ShardusTypes.IncomingTransactionResult,
): ShardusTypes.IncomingTransactionResult => {
  const ctx = loadProjectTxContext(wrappedStates, tx.from, tx.proposalId, tx.milestoneNumber)
  if (ctx.error) {
    response.reason = ctx.error
    return response
  }
  const { from, project, milestone } = ctx

  // Only the contractor is paid, and only for work the committee agreed was finished.
  if (tx.from !== project.address) {
    response.reason = 'Only the contractor may claim a milestone'
    return response
  }
  if (milestone.status !== 'completed') {
    response.reason = `Milestone ${tx.milestoneNumber} is not completed (current: ${milestone.status})`
    return response
  }
  if (milestone.paid > 0n) {
    response.reason = `Milestone ${tx.milestoneNumber} has already been paid`
    return response
  }

  let payoutWei: bigint
  try {
    payoutWei = milestonePayoutWei(milestone, project.durationBonusPercentage, project.durationPenaltyPercentage, (usdStr) =>
      usdToWeiAtRate(usdStr, project.rateUsdStr),
    ).amountWei
  } catch (err) {
    response.reason = err instanceof Error ? err.message : String(err)
    return response
  }
  // The balance is what was actually minted, so it caps what can be paid out regardless of what the
  // milestone arithmetic says.
  if (payoutWei > project.balance) {
    response.reason = `Milestone payout (${payoutWei}) exceeds the project balance (${project.balance})`
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
  tx: Tx.DaoProjectMilestoneClaim,
  txTimestamp: number,
  txId: string,
  wrappedStates: WrappedStates,
  dapp: Shardus,
  applyResponse: ShardusTypes.ApplyResponse,
): void => {
  const from = wrappedStates[tx.from].data as UserAccount
  const proposal = wrappedStates[tx.proposalId].data as DaoProposalAccount
  const project = proposal.project
  const milestone = project.milestones[tx.milestoneNumber - 1]

  const txFeeWei = utils.getTransactionFeeWei(AccountsStorage.cachedNetworkAccount)
  from.data.balance = SafeBigIntMath.subtract(from.data.balance, txFeeWei)

  const payout = milestonePayoutWei(milestone, project.durationBonusPercentage, project.durationPenaltyPercentage, (usdStr) =>
    usdToWeiAtRate(usdStr, project.rateUsdStr),
  )
  project.balance = SafeBigIntMath.subtract(project.balance, payout.amountWei)
  from.data.balance = SafeBigIntMath.add(from.data.balance, payout.amountWei)
  // Records the amount, not a boolean: a zero payout from a heavy penalty still settles the
  // milestone, and `paid > 0n` is what blocks a second claim.
  milestone.paid = payout.amountWei

  appendProjectLog(
    project,
    tx.from,
    txTimestamp,
    'dao_project_milestone_claim',
    `milestone=${tx.milestoneNumber} speed=${payout.speed} paid=${payout.amountWei}`,
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
      deliverySpeed: payout.speed,
      paidWei: payout.amountWei,
      remainingBalanceWei: project.balance,
    },
  }
  applyResponse.appReceiptDataHash = crypto.hashObj(appReceiptData)
  applyResponse.appReceiptData = appReceiptData

  dapp.log('Applied dao_project_milestone_claim tx', from.id, tx.proposalId, tx.milestoneNumber, payout.amountWei)
}

export const createFailedAppReceiptData = (tx: Tx.DaoProjectMilestoneClaim, txId: string, txTimestamp: number, reason: string): AppReceiptData => {
  return { txId, timestamp: txTimestamp, success: false, from: tx.from, to: tx.proposalId, type: tx.type, transactionFee: 0n, additionalInfo: { reason } }
}

export const keys = (tx: Tx.DaoProjectMilestoneClaim, result: ShardusTypes.TransactionKeys): ShardusTypes.TransactionKeys => {
  result.sourceKeys = [tx.from]
  result.targetKeys = [tx.proposalId]
  result.allKeys = [...result.sourceKeys, ...result.targetKeys]
  return result
}

export const memoryPattern = (tx: Tx.DaoProjectMilestoneClaim): ShardusTypes.ShardusMemoryPatternsInput => {
  return { rw: [tx.from, tx.proposalId], wo: [], on: [], ri: [], ro: [] }
}

export const createRelevantAccount = (
  dapp: Shardus,
  account: UserAccount | DaoProposalAccount,
  accountId: string,
  tx: Tx.DaoProjectMilestoneClaim,
  accountCreated = false,
): ShardusTypes.WrappedResponse => {
  if (!account) {
    throw new Error(`dao_project_milestone_claim.createRelevantAccount: account ${accountId} does not exist`)
  }
  return dapp.createWrappedResponse(accountId, accountCreated, account.hash, account.timestamp, account)
}
