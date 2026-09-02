import * as crypto from '../../crypto'
import { Shardus, ShardusTypes } from '@shardus/core'
import { UserAccount, WrappedStates, Tx, AppReceiptData, DaoProposalAccount, DaoProposalsMeta } from '../../@types'
import { SafeBigIntMath } from '../../utils/safeBigIntMath'
import * as AccountsStorage from '../../storage/accountStorage'
import * as utils from '../../utils'
import { daoProposalsMetaId } from '../../accounts/daoProposalsMetaAccount'
import { recordProposalStatus } from '../../utils/daoProposalIndex'
import { appendProjectLog } from '../../utils/daoProjectLog'
import { allMilestonesFinished } from '../../utils/daoProjectMilestoneState'
import { milestonePayoutWei, usdToWeiAtRate } from '../../utils/daoProjectPayout'
import { loadProjectTxContext } from '../../utils/daoProjectTxContext'

export const validate_fields = (tx: Tx.DaoProjectEnd, response: ShardusTypes.IncomingTransactionResult): ShardusTypes.IncomingTransactionResult => {
  if (utils.isValidAddress(tx.from) === false) {
    response.reason = 'tx "from" is not a valid address'
    return response
  }
  if (utils.isValidAddress(tx.proposalId) === false) {
    response.reason = 'tx "proposalId" is not a valid address'
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
  tx: Tx.DaoProjectEnd,
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

  if (!proposal.committeeAddresses.includes(tx.from)) {
    response.reason = 'Only a committee member can end a project'
    return response
  }
  if (!allMilestonesFinished(project)) {
    response.reason = 'Every milestone must be completed or terminated before the project can end'
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
  tx: Tx.DaoProjectEnd,
  txTimestamp: number,
  txId: string,
  wrappedStates: WrappedStates,
  dapp: Shardus,
  applyResponse: ShardusTypes.ApplyResponse,
): void => {
  const from = wrappedStates[tx.from].data as UserAccount
  const proposal = wrappedStates[tx.proposalId].data as DaoProposalAccount
  const meta = wrappedStates[daoProposalsMetaId()].data as DaoProposalsMeta
  const project = proposal.project
  const previousStatus = proposal.status

  const txFeeWei = utils.getTransactionFeeWei(AccountsStorage.cachedNetworkAccount)
  from.data.balance = SafeBigIntMath.subtract(from.data.balance, txFeeWei)

  // Shrink the balance to exactly what is still owed: completed milestones that have not been
  // claimed yet. Everything else — terminated milestones, and milestones already paid — releases.
  // The contractor can keep claiming against this after the project ends, which is why the balance
  // is trimmed rather than zeroed.
  const owedWei = project.milestones.reduce((total, m) => {
    if (m.status !== 'completed' || m.paid > 0n) return total
    return (
      total +
      milestonePayoutWei(m, project.durationBonusPercentage, project.durationPenaltyPercentage, (usdStr) => usdToWeiAtRate(usdStr, project.rateUsdStr))
        .amountWei
    )
  }, 0n)
  project.balance = owedWei
  project.endTime = txTimestamp

  // D4: the project takes the last milestone's status. Simple, and deliberately chosen over
  // "terminated if any milestone was terminated" — note this can under-report failure, since a
  // project whose earlier milestone was terminated but whose last one completed reads as completed.
  const lastMilestone = project.milestones[project.milestones.length - 1]
  proposal.status = lastMilestone.status === 'terminated' ? 'terminated' : 'completed'
  proposal.timestamp = txTimestamp

  appendProjectLog(project, tx.from, txTimestamp, 'dao_project_end', `status=${proposal.status} owed=${owedWei}`)

  if (proposal.status !== previousStatus) {
    recordProposalStatus(meta, proposal.number, proposal.status, proposal.emergency, txTimestamp)
  }

  from.timestamp = txTimestamp
  meta.timestamp = txTimestamp

  const appReceiptData: AppReceiptData = {
    txId,
    timestamp: txTimestamp,
    success: true,
    from: from.id,
    to: proposal.id,
    type: tx.type,
    transactionFee: txFeeWei,
    additionalInfo: { proposalNumber: proposal.number, proposalStatus: proposal.status, remainingBalanceWei: project.balance },
  }
  const appReceiptDataHash = crypto.hashObj(appReceiptData)
  dapp.applyResponseAddReceiptData(applyResponse, appReceiptData, appReceiptDataHash)

  dapp.log('Applied dao_project_end tx', from.id, tx.proposalId, proposal.status)
}

export const createFailedAppReceiptData = (
  tx: Tx.DaoProjectEnd,
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

export const keys = (tx: Tx.DaoProjectEnd, result: ShardusTypes.TransactionKeys): ShardusTypes.TransactionKeys => {
  result.sourceKeys = [tx.from]
  result.targetKeys = [tx.proposalId, daoProposalsMetaId()]
  result.allKeys = [...result.sourceKeys, ...result.targetKeys]
  return result
}

export const memoryPattern = (tx: Tx.DaoProjectEnd): ShardusTypes.ShardusMemoryPatternsInput => {
  return { rw: [tx.from, tx.proposalId, daoProposalsMetaId()], wo: [], on: [], ri: [], ro: [] }
}

export const createRelevantAccount = (
  dapp: Shardus,
  account: UserAccount | DaoProposalAccount | DaoProposalsMeta,
  accountId: string,
  tx: Tx.DaoProjectEnd,
  accountCreated = false,
): ShardusTypes.WrappedResponse => {
  if (!account) {
    throw new Error(`dao_project_end.createRelevantAccount: account ${accountId} does not exist`)
  }
  return dapp.createWrappedResponse(accountId, accountCreated, account.hash, account.timestamp, account)
}
