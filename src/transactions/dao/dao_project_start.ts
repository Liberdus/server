import * as crypto from '../../crypto'
import { Shardus, ShardusTypes } from '@shardus/core'
import * as config from '../../config'
import { NetworkAccount, UserAccount, WrappedStates, Tx, AppReceiptData, DaoProposalAccount, DaoProposalsMeta } from '../../@types'
import { SafeBigIntMath } from '../../utils/safeBigIntMath'
import * as AccountsStorage from '../../storage/accountStorage'
import * as utils from '../../utils'
import { isUserAccount, isDaoProposalAccount } from '../../@types/accountTypeGuards'
import { daoProposalsMetaId } from '../../accounts/daoProposalsMetaAccount'
import { recordProposalStatus } from '../../utils/daoProposalIndex'
import { getApplyEligibleAt } from '../../accounts/daoProposalAccount'
import { exceedsMintThreshold, maxMintThresholdWei, projectMintAmountWei } from '../../utils/daoProjectMint'
import { appendProjectLog } from '../../utils/daoProjectLog'

export const validate_fields = (tx: Tx.DaoProjectStart, response: ShardusTypes.IncomingTransactionResult): ShardusTypes.IncomingTransactionResult => {
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
  tx: Tx.DaoProjectStart,
  wrappedStates: WrappedStates,
  response: ShardusTypes.IncomingTransactionResult,
): ShardusTypes.IncomingTransactionResult => {
  const from = wrappedStates[tx.from]?.data as UserAccount
  const proposal = wrappedStates[tx.proposalId]?.data as DaoProposalAccount
  const network = wrappedStates[config.networkAccount]?.data as NetworkAccount

  if (!from || !isUserAccount(from)) {
    response.reason = 'from account not found or is not a UserAccount'
    return response
  }
  if (!proposal || !isDaoProposalAccount(proposal)) {
    response.reason = 'Proposal account not found or is not a DaoProposalAccount'
    return response
  }
  if (!network) {
    response.reason = 'Network account not found'
    return response
  }
  if (proposal.proposalType !== 'project') {
    response.reason = `Proposal type "${proposal.proposalType}" is not a project`
    return response
  }
  if (proposal.status !== 'accepted') {
    response.reason = `Proposal is not in accepted status (current: ${proposal.status})`
    return response
  }
  if (!proposal.project) {
    response.reason = 'Project proposal is missing its project data'
    return response
  }
  // Committee-only. This transaction mints, so it is deliberately not open to anyone the way
  // dao_apply_parameters is for non-emergency parameter proposals.
  if (!proposal.committeeAddresses.includes(tx.from)) {
    response.reason = 'Only a committee member can start a project'
    return response
  }
  // Projects never carry the emergency exemption (dao_proposal_create rejects emergency projects),
  // so the grace period always applies.
  if (tx.timestamp < getApplyEligibleAt(proposal)) {
    response.reason = 'Grace period has not elapsed yet'
    return response
  }

  let mintWei: bigint
  try {
    mintWei = projectMintAmountWei(proposal.project.milestones, (usdStr) => utils.usdStrToWei(usdStr, network))
    if (exceedsMintThreshold(mintWei)) {
      response.reason = `Project would mint ${mintWei} wei, exceeding the maximum of ${maxMintThresholdWei()} wei`
      return response
    }
  } catch (err) {
    // A malformed milestone amount or a malformed mint ceiling both land here. Failing the
    // transaction is the correct outcome for either — never mint on an amount we could not compute.
    response.reason = err instanceof Error ? err.message : String(err)
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
  tx: Tx.DaoProjectStart,
  txTimestamp: number,
  txId: string,
  wrappedStates: WrappedStates,
  dapp: Shardus,
  applyResponse: ShardusTypes.ApplyResponse,
): void => {
  const from = wrappedStates[tx.from].data as UserAccount
  const proposal = wrappedStates[tx.proposalId].data as DaoProposalAccount
  const network = wrappedStates[config.networkAccount].data as NetworkAccount
  const meta = wrappedStates[daoProposalsMetaId()].data as DaoProposalsMeta
  const previousStatus = proposal.status
  const project = proposal.project

  const txFeeWei = utils.getTransactionFeeWei(AccountsStorage.cachedNetworkAccount)
  from.data.balance = SafeBigIntMath.subtract(from.data.balance, txFeeWei)

  // The mint. Recomputed here rather than carried from validate() so apply() depends only on
  // wrappedStates, which Shardus snapshots identically for every node.
  const mintWei = projectMintAmountWei(project.milestones, (usdStr) => utils.usdStrToWei(usdStr, network))
  project.balance = mintWei
  // Every later payout converts at this rate, not the live one, so the contractor carries the LIB
  // price risk from here and the DAO's exposure is fixed at the amount minted.
  project.rateUsdStr = network.current.stabilityFactorStr
  project.startTime = txTimestamp

  proposal.status = 'executing'
  proposal.timestamp = txTimestamp

  appendProjectLog(project, tx.from, txTimestamp, 'dao_project_start', `mint=${mintWei} rate=${project.rateUsdStr}`)

  // Always a real transition (accepted -> executing), but the guard is kept so every handler reads
  // the same way and stays correct if the branches ever change.
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
    additionalInfo: {
      proposalNumber: proposal.number,
      proposalStatus: proposal.status,
      mintedWei: mintWei,
      rateUsdStr: project.rateUsdStr,
    },
  }
  const appReceiptDataHash = crypto.hashObj(appReceiptData)
  dapp.applyResponseAddReceiptData(applyResponse, appReceiptData, appReceiptDataHash)

  dapp.log('Applied dao_project_start tx', from.id, tx.proposalId, 'minted', mintWei)
}

export const createFailedAppReceiptData = (
  tx: Tx.DaoProjectStart,
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

export const keys = (tx: Tx.DaoProjectStart, result: ShardusTypes.TransactionKeys): ShardusTypes.TransactionKeys => {
  result.sourceKeys = [tx.from]
  result.targetKeys = [tx.proposalId, config.networkAccount, daoProposalsMetaId()]
  result.allKeys = [...result.sourceKeys, ...result.targetKeys]
  return result
}

export const memoryPattern = (tx: Tx.DaoProjectStart): ShardusTypes.ShardusMemoryPatternsInput => {
  return {
    rw: [tx.from, tx.proposalId, daoProposalsMetaId()],
    wo: [],
    on: [],
    ri: [],
    ro: [config.networkAccount],
  }
}

export const createRelevantAccount = (
  dapp: Shardus,
  account: UserAccount | DaoProposalAccount | DaoProposalsMeta,
  accountId: string,
  tx: Tx.DaoProjectStart,
  accountCreated = false,
): ShardusTypes.WrappedResponse => {
  if (!account) {
    throw new Error(`dao_project_start.createRelevantAccount: account ${accountId} does not exist`)
  }
  return dapp.createWrappedResponse(accountId, accountCreated, account.hash, account.timestamp, account)
}
