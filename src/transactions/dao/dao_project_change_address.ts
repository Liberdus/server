import * as crypto from '../../crypto'
import { Shardus, ShardusTypes } from '@shardus/core'
import { UserAccount, WrappedStates, Tx, AppReceiptData, DaoProposalAccount } from '../../@types'
import { SafeBigIntMath } from '../../utils/safeBigIntMath'
import * as AccountsStorage from '../../storage/accountStorage'
import * as utils from '../../utils'
import { isUserAccount, isDaoProposalAccount } from '../../@types/accountTypeGuards'
import { appendProjectLog } from '../../utils/daoProjectLog'
import { applyEndorsement } from '../../utils/daoProjectEndorsement'

export const validate_fields = (tx: Tx.DaoProjectChangeAddress, response: ShardusTypes.IncomingTransactionResult): ShardusTypes.IncomingTransactionResult => {
  if (utils.isValidAddress(tx.from) === false) {
    response.reason = 'tx "from" is not a valid address'
    return response
  }
  if (utils.isValidAddress(tx.proposalId) === false) {
    response.reason = 'tx "proposalId" is not a valid address'
    return response
  }
  if (tx.proposedAddress !== undefined && utils.isValidAddress(tx.proposedAddress) === false) {
    response.reason = 'tx "proposedAddress" is not a valid address'
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
  tx: Tx.DaoProjectChangeAddress,
  wrappedStates: WrappedStates,
  response: ShardusTypes.IncomingTransactionResult,
): ShardusTypes.IncomingTransactionResult => {
  const from = wrappedStates[tx.from]?.data as UserAccount
  const proposal = wrappedStates[tx.proposalId]?.data as DaoProposalAccount

  if (!from || !isUserAccount(from)) {
    response.reason = 'from account not found or is not a UserAccount'
    return response
  }
  if (!proposal || !isDaoProposalAccount(proposal) || proposal.proposalType !== 'project' || !proposal.project) {
    response.reason = 'Proposal is not a project proposal'
    return response
  }
  const project = proposal.project

  // Deliberately not allowed while merely `accepted`: before dao_project_start there are no funds
  // to redirect, and the community voted on a proposal naming this contractor. Substituting another
  // party before the project even begins changes what was approved without another vote — the
  // correct response to a contractor becoming unavailable then is a new proposal.
  const isRunning = proposal.status === 'executing'
  const isSettling = (proposal.status === 'completed' || proposal.status === 'terminated') && project.balance > 0n
  if (!isRunning && !isSettling) {
    response.reason = `Contractor address cannot be changed while the project is ${proposal.status}${
      project.balance === 0n ? ' with no remaining balance' : ''
    }`
    return response
  }
  // Committee only. Unlike milestone timings, the contractor has no say in who replaces them.
  if (!proposal.committeeAddresses.includes(tx.from)) {
    response.reason = 'Only a committee member can change the contractor address'
    return response
  }
  if (tx.proposedAddress !== undefined && tx.proposedAddress === project.address) {
    response.reason = 'Proposed address is already the contractor address'
    return response
  }

  const dryRun = applyEndorsement(
    [...project.endorsedAddress],
    tx.from,
    tx.proposedAddress !== undefined,
    proposal.committeeAddresses,
    undefined,
    project.proposedAddress !== undefined,
  )
  if (dryRun.error) {
    response.reason = dryRun.error
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
  tx: Tx.DaoProjectChangeAddress,
  txTimestamp: number,
  txId: string,
  wrappedStates: WrappedStates,
  dapp: Shardus,
  applyResponse: ShardusTypes.ApplyResponse,
): void => {
  const from = wrappedStates[tx.from].data as UserAccount
  const proposal = wrappedStates[tx.proposalId].data as DaoProposalAccount
  const project = proposal.project

  const txFeeWei = utils.getTransactionFeeWei(AccountsStorage.cachedNetworkAccount)
  from.data.balance = SafeBigIntMath.subtract(from.data.balance, txFeeWei)

  // Presence, per policy line 352: "if called without an address it is endorsing the proposed
  // address". Read hadPendingAddress before the assignment below so the endorse branch cannot see a
  // pending value this transaction just created.
  const isProposing = tx.proposedAddress !== undefined
  const hadPendingAddress = project.proposedAddress !== undefined
  if (isProposing) project.proposedAddress = tx.proposedAddress
  // No contractor slot here — passing undefined keeps the threshold clamped to the committee size.
  const result = applyEndorsement(project.endorsedAddress, tx.from, isProposing, proposal.committeeAddresses, undefined, hadPendingAddress)
  // validate() dry-runs the same call against a copy, so an error here means the two disagreed.
  // Throwing rather than continuing keeps a half-applied endorsement out of consensus state.
  if (result.error) throw new Error(`dao_project_change_address endorsement failed after validation: ${result.error}`)

  const previousAddress = project.address
  if (result.committed) {
    project.address = project.proposedAddress
    project.proposedAddress = undefined
    project.endorsedAddress = []
  }

  appendProjectLog(project, tx.from, txTimestamp, 'dao_project_change_address', `proposed=${tx.proposedAddress ?? ''} committed=${result.committed === true}`)

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
      previousAddress,
      contractorAddress: project.address,
      endorsements: project.endorsedAddress.length,
      committed: result.committed === true,
    },
  }
  const appReceiptDataHash = crypto.hashObj(appReceiptData)
  dapp.applyResponseAddReceiptData(applyResponse, appReceiptData, appReceiptDataHash)

  dapp.log('Applied dao_project_change_address tx', from.id, tx.proposalId)
}

export const createFailedAppReceiptData = (
  tx: Tx.DaoProjectChangeAddress,
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

export const keys = (tx: Tx.DaoProjectChangeAddress, result: ShardusTypes.TransactionKeys): ShardusTypes.TransactionKeys => {
  result.sourceKeys = [tx.from]
  result.targetKeys = [tx.proposalId]
  result.allKeys = [...result.sourceKeys, ...result.targetKeys]
  return result
}

export const memoryPattern = (tx: Tx.DaoProjectChangeAddress): ShardusTypes.ShardusMemoryPatternsInput => {
  return { rw: [tx.from, tx.proposalId], wo: [], on: [], ri: [], ro: [] }
}

export const createRelevantAccount = (
  dapp: Shardus,
  account: UserAccount | DaoProposalAccount,
  accountId: string,
  tx: Tx.DaoProjectChangeAddress,
  accountCreated = false,
): ShardusTypes.WrappedResponse => {
  if (!account) {
    throw new Error(`dao_project_change_address.createRelevantAccount: account ${accountId} does not exist`)
  }
  return dapp.createWrappedResponse(accountId, accountCreated, account.hash, account.timestamp, account)
}
