import * as crypto from '../../crypto'
import { Shardus, ShardusTypes } from '@shardus/core'
import { UserAccount, WrappedStates, Tx, AppReceiptData, DaoProposalAccount } from '../../@types'
import { SafeBigIntMath } from '../../utils/safeBigIntMath'
import * as AccountsStorage from '../../storage/accountStorage'
import * as utils from '../../utils'
import { isUserAccount, isDaoProposalAccount } from '../../@types/accountTypeGuards'
import { getVotingStart, getVotingEnd } from '../../accounts/daoProposalAccount'
import { getTimeMultiplier, calculateOptionWeights } from '../../utils/daoVoteMath'

export const validate_fields = (tx: Tx.DaoVote, response: ShardusTypes.IncomingTransactionResult): ShardusTypes.IncomingTransactionResult => {
  if (utils.isValidAddress(tx.from) === false) {
    response.reason = 'tx "from" is not a valid address'
    return response
  }
  if (utils.isValidAddress(tx.proposalId) === false) {
    response.reason = 'tx "proposalId" must be a 64-char hex string'
    return response
  }
  // weights[i] maps 1:1 by index onto proposal.options[i] (no separate options field on the tx).
  // Per-proposal length/sum checks happen in validate(), where proposal.options is available.
  if (!Array.isArray(tx.weights) || tx.weights.length < 2 || tx.weights.length > 10) {
    response.reason = 'tx "weights" must be an array with 2 to 10 entries'
    return response
  }
  for (const w of tx.weights) {
    if (!Number.isSafeInteger(w) || w < 0) {
      response.reason = 'each entry in tx "weights" must be a non-negative integer'
      return response
    }
  }
  if (typeof tx.spend !== 'bigint' || tx.spend <= 0n) {
    response.reason = 'tx "spend" must be a positive bigint'
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
  tx: Tx.DaoVote,
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
  if (proposal.status !== 'voting') {
    response.reason = `Proposal is not in voting status (current: ${proposal.status})`
    return response
  }
  if (tx.timestamp < getVotingStart(proposal)) {
    response.reason = 'Voting period has not started yet'
    return response
  }
  if (tx.timestamp > getVotingEnd(proposal)) {
    response.reason = 'Voting period has ended'
    return response
  }
  if (tx.weights.length !== proposal.options.length) {
    response.reason = `tx "weights" length (${tx.weights.length}) must match the proposal's options length (${proposal.options.length})`
    return response
  }
  const totalSelectionWeight = tx.weights.reduce((sum, w) => sum + w, 0)
  if (totalSelectionWeight <= 0) {
    response.reason = 'tx "weights" must include at least one positive weight'
    return response
  }
  if (!Number.isSafeInteger(totalSelectionWeight)) {
    response.reason = 'tx "weights" sum exceeds safe integer range; individual values are too large'
    return response
  }
  // usdStrToWei re-converts at the current exchange rate, not the rate at proposal creation
  const minimumSpendWei = utils.usdStrToWei(proposal.minimumSpendUsdStr, AccountsStorage.cachedNetworkAccount)
  const voteThresholdWei = utils.usdStrToWei(proposal.voteThresholdUsdStr, AccountsStorage.cachedNetworkAccount)

  if (tx.spend < minimumSpendWei) {
    response.reason = `spend (${utils.weiToLib(tx.spend)} LIB) is less than the minimum required (${utils.weiToLib(minimumSpendWei)} LIB)`
    return response
  }
  if (tx.spend > from.data.balance) {
    response.reason = `spend (${utils.weiToLib(tx.spend)} LIB) exceeds account balance (${utils.weiToLib(from.data.balance)} LIB)`
    return response
  }
  if (from.data.balance < voteThresholdWei) {
    response.reason = `account balance (${utils.weiToLib(from.data.balance)} LIB) is below the vote threshold (${utils.weiToLib(voteThresholdWei)} LIB)`
    return response
  }

  const txFeeWei = utils.getTransactionFeeWei(AccountsStorage.cachedNetworkAccount)
  if (from.data.balance < tx.spend + txFeeWei) {
    response.reason = 'Insufficient balance to cover the vote spend and transaction fee'
    return response
  }

  response.success = true
  response.reason = 'This transaction is valid!'
  return response
}

export const apply = (
  tx: Tx.DaoVote,
  txTimestamp: number,
  txId: string,
  wrappedStates: WrappedStates,
  dapp: Shardus,
  applyResponse: ShardusTypes.ApplyResponse,
): void => {
  const from = wrappedStates[tx.from].data as UserAccount
  const proposal = wrappedStates[tx.proposalId].data as DaoProposalAccount

  const txFeeWei = utils.getTransactionFeeWei(AccountsStorage.cachedNetworkAccount)

  // Deduct spend and fee from voter balance
  from.data.balance = SafeBigIntMath.subtract(from.data.balance, tx.spend)
  from.data.balance = SafeBigIntMath.subtract(from.data.balance, txFeeWei)

  const votingStart = getVotingStart(proposal)
  const votingEnd = getVotingEnd(proposal)
  const halfDuration = proposal.votingDuration / 2

  const timeMultiplier = getTimeMultiplier(txTimestamp, votingStart, votingEnd, halfDuration)

  // Distribute weight across options proportionally; votes are additive across multiple casts.
  const minimumSpendWei = utils.usdStrToWei(proposal.minimumSpendUsdStr, AccountsStorage.cachedNetworkAccount)
  const optionWeights = calculateOptionWeights({
    spend: tx.spend,
    minimumSpendWei,
    voteExponent: proposal.voteExponent,
    weights: tx.weights,
    timeMultiplier,
  })
  for (let i = 0; i < optionWeights.length; i++) {
    if (optionWeights[i] === 0n) continue
    proposal.totalVote[i] = (proposal.totalVote[i] ?? 0n) + optionWeights[i]
  }

  // Add spend to reward pool
  proposal.voterRewardPool = (proposal.voterRewardPool ?? 0n) + tx.spend

  // Add voter to voterList on their first vote.
  const alreadyListed = proposal.voterList.some((v) => v.address === tx.from)
  if (!alreadyListed) {
    proposal.voterList.push({ address: tx.from, timestamp: txTimestamp })
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
    additionalInfo: {
      weights: tx.weights,
      spend: tx.spend,
      optionWeights,
    },
  }
  const appReceiptDataHash = crypto.hashObj(appReceiptData)
  dapp.applyResponseAddReceiptData(applyResponse, appReceiptData, appReceiptDataHash)
  dapp.log(
    'Applied dao_vote tx',
    tx.from,
    tx.proposalId,
    tx.weights,
    optionWeights.map((w) => w.toString()),
  )
}

export const createFailedAppReceiptData = (
  tx: Tx.DaoVote,
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
    to: tx.proposalId,
    type: tx.type,
    transactionFee,
  }
  const appReceiptDataHash = crypto.hashObj(appReceiptData)
  dapp.applyResponseAddReceiptData(applyResponse, appReceiptData, appReceiptDataHash)
}

export const keys = (tx: Tx.DaoVote, result: ShardusTypes.TransactionKeys): ShardusTypes.TransactionKeys => {
  result.sourceKeys = [tx.from]
  result.targetKeys = [tx.proposalId]
  result.allKeys = [...result.sourceKeys, ...result.targetKeys]
  return result
}

export const memoryPattern = (tx: Tx.DaoVote, result: ShardusTypes.TransactionKeys): ShardusTypes.ShardusMemoryPatternsInput => {
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
  tx: Tx.DaoVote,
  accountCreated = false,
): ShardusTypes.WrappedResponse => {
  if (!account) {
    throw new Error(`dao_vote.createRelevantAccount: account ${accountId} does not exist`)
  }
  return dapp.createWrappedResponse(accountId, accountCreated, account.hash, account.timestamp, account)
}
