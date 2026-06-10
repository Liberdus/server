import Decimal from 'decimal.js'
import * as crypto from '../crypto'
import { Shardus, ShardusTypes } from '@shardus/core'
import * as config from '../config'
import { NetworkAccount, UserAccount, WrappedStates, Tx, AppReceiptData, DaoProposalAccount } from '../@types'
import { SafeBigIntMath } from '../utils/safeBigIntMath'
import * as AccountsStorage from '../storage/accountStorage'
import * as utils from '../utils'
import { isUserAccount, isDaoProposalAccount } from '../@types/accountTypeGuards'
import { LiberdusFlags } from '../config'
import { getVotingStart, getVotingEnd } from '../accounts/daoProposalAccount'

// Isolated Decimal context for vote-weight math. Using Decimal (not Math.pow/Number) ensures
// consensus-critical calculations — especially the fractional voteExponent pow() — are
// deterministic across all nodes regardless of JS engine version or IEEE-754 rounding.
// precision: 40 is conservative since spend, voteExponent, and minimumSpend are unbounded
// or governance-mutable; tighten once explicit parameter bounds are enforced.
const DaoDecimal = Decimal.clone({ precision: 40 })
const WEI_PER_LIB = new DaoDecimal('1e18')
const WEIGHT_PRECISION = new DaoDecimal('1e12')

// Time-decay: 1 in the first half of voting, then linearly decays to 0 by votingEnd.
function getTimeMultiplier(txTimestamp: number, votingStart: number, votingEnd: number, halfDuration: number): Decimal {
  if (txTimestamp - votingStart <= halfDuration) {
    return new DaoDecimal(1)
  }
  // timeLeft / halfDuration decays from 1 → 0 over the second half; clamped at 0.
  return DaoDecimal.max(0, new DaoDecimal(votingEnd - txTimestamp).dividedBy(halfDuration))
}

export const validate_fields = (tx: Tx.DaoVote, response: ShardusTypes.IncomingTransactionResult): ShardusTypes.IncomingTransactionResult => {
  if (!LiberdusFlags.enableNewDAOTransactions) {
    response.reason = 'New DAO transactions are not enabled'
    return response
  }
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
  if (tx.spend < proposal.minimumSpendWei) {
    response.reason = `spend (${utils.weiToLib(tx.spend)} LIB) is less than the minimum required (${utils.weiToLib(proposal.minimumSpendWei)} LIB)`
    return response
  }
  if (tx.spend > from.data.balance) {
    response.reason = `spend (${utils.weiToLib(tx.spend)} LIB) exceeds account balance (${utils.weiToLib(from.data.balance)} LIB)`
    return response
  }
  if (from.data.balance < proposal.voteThresholdWei) {
    response.reason = `account balance (${utils.weiToLib(from.data.balance)} LIB) is below the vote threshold (${utils.weiToLib(proposal.voteThresholdWei)} LIB)`
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
  const from: UserAccount = wrappedStates[tx.from].data as unknown as UserAccount
  const proposal: DaoProposalAccount = wrappedStates[tx.proposalId].data as unknown as DaoProposalAccount

  const txFeeWei = utils.getTransactionFeeWei(AccountsStorage.cachedNetworkAccount)

  // Deduct spend and fee from voter balance
  from.data.balance = SafeBigIntMath.subtract(from.data.balance, tx.spend)
  from.data.balance = SafeBigIntMath.subtract(from.data.balance, txFeeWei)

  const votingStart = getVotingStart(proposal)
  const votingEnd = getVotingEnd(proposal)
  const halfDuration = proposal.votingDuration / 2
  const totalSelectionWeight = tx.weights.reduce((sum, w) => sum + w, 0)

  // Policy formula:
  //   option[x] = voteSpend * (voteSpend / minimumSpend)^voteExponent
  //               * timeLeftInSecondHalf / totalTimeInSecondHalf
  //               * selectionWeight[x] / totalSelectionWeight
  // baseWeight = spendInLIB * spendBoost * timeMultiplier * WEIGHT_PRECISION / totalSelectionWeight
  // pre-divides by totalSelectionWeight so each loop iteration just multiplies by weights[i].
  // WEIGHT_PRECISION (1e12) scales the result into a bigint without losing sub-LIB precision.
  const timeMultiplier = getTimeMultiplier(txTimestamp, votingStart, votingEnd, halfDuration)
  const spendInLIB = new DaoDecimal(tx.spend.toString()).dividedBy(WEI_PER_LIB)
  const spendBoost = new DaoDecimal(tx.spend.toString()).dividedBy(proposal.minimumSpendWei.toString()).pow(proposal.voteExponent)
  const baseWeight = spendInLIB.times(spendBoost).times(timeMultiplier).times(WEIGHT_PRECISION).dividedBy(totalSelectionWeight)

  // Distribute weight across options proportionally; votes are additive across multiple casts.
  const optionWeights: bigint[] = proposal.options.map(() => 0n)
  for (let i = 0; i < tx.weights.length; i++) {
    if (tx.weights[i] <= 0) continue
    const optionWeight = BigInt(baseWeight.times(tx.weights[i]).floor().toFixed())
    optionWeights[i] = optionWeight
    proposal.weights[i] = (proposal.weights[i] ?? 0n) + optionWeight
  }

  // Add spend to reward pool
  proposal.voterRewardPool = (proposal.voterRewardPool ?? 0n) + tx.spend

  // Add voter to voterList on their first vote (minimum-spend votes only)
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
      spend: tx.spend.toString(),
      optionWeights: optionWeights.map((w) => w.toString()),
    },
  }
  const appReceiptDataHash = crypto.hashObj(appReceiptData)
  dapp.applyResponseAddReceiptData(applyResponse, appReceiptData, appReceiptDataHash)
  dapp.log('Applied dao_vote tx', tx.from, tx.proposalId, tx.weights, optionWeights.map((w) => w.toString()))
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
