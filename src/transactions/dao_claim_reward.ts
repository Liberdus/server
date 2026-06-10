import * as crypto from '../crypto'
import { Shardus, ShardusTypes } from '@shardus/core'
import * as config from '../config'
import { UserAccount, WrappedStates, Tx, AppReceiptData, DaoProposalAccount } from '../@types'
import { SafeBigIntMath } from '../utils/safeBigIntMath'
import * as AccountsStorage from '../storage/accountStorage'
import * as utils from '../utils'
import { isUserAccount, isDaoProposalAccount } from '../@types/accountTypeGuards'
import { LiberdusFlags } from '../config'
import { getClaimEnd, getVotingStart } from '../accounts/daoProposalAccount'

const PRECISION = BigInt(10 ** 18)

export const validate_fields = (tx: Tx.DaoClaimReward, response: ShardusTypes.IncomingTransactionResult): ShardusTypes.IncomingTransactionResult => {
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
  tx: Tx.DaoClaimReward,
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
  if (proposal.status !== 'accepted' && proposal.status !== 'applied' && proposal.status !== 'rejected') {
    response.reason = `Proposal voting has not been finalised (current status: ${proposal.status})`
    return response
  }
  if (tx.timestamp > getClaimEnd(proposal)) {
    response.reason = 'Claim period has ended'
    return response
  }

  const voterEntry = proposal.voterList.find((v) => v.address === tx.from)
  if (!voterEntry) {
    response.reason = 'tx sender did not vote on this proposal'
    return response
  }
  if (proposal.claimList.includes(tx.from)) {
    response.reason = 'tx sender has already claimed their reward for this proposal'
    return response
  }
  if (proposal.voterList.length === 0) {
    response.reason = 'No voters eligible for reward on this proposal'
    return response
  }
  if (proposal.voterRewardPool === 0n) {
    response.reason = 'Reward pool is empty'
    return response
  }
  if (proposal.claimedAmount >= proposal.voterRewardPool) {
    response.reason = 'Reward pool has been fully claimed'
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
  tx: Tx.DaoClaimReward,
  txTimestamp: number,
  txId: string,
  wrappedStates: WrappedStates,
  dapp: Shardus,
  applyResponse: ShardusTypes.ApplyResponse,
): void => {
  const from: UserAccount = wrappedStates[tx.from].data as unknown as UserAccount
  const proposal: DaoProposalAccount = wrappedStates[tx.proposalId].data as unknown as DaoProposalAccount

  const voterIndex = proposal.voterList.findIndex((v) => v.address === tx.from)
  const voterEntry = proposal.voterList[voterIndex]

  // Time delta: gap between this voter's vote and the previous voter (or voting start if first)
  const previousTimestamp = voterIndex === 0 ? getVotingStart(proposal) : proposal.voterList[voterIndex - 1].timestamp
  let timeDelta = BigInt(voterEntry.timestamp - previousTimestamp)
  // Clamp to zero: out-of-order landing (rare) should not produce a negative timeDelta
  // and silently reduce the claimant's balance via the reward formula.
  if (timeDelta < 0n) {
    timeDelta = 0n
  }

  const votingDuration = BigInt(proposal.votingDuration)
  const N = BigInt(proposal.voterList.length)

  // Reward formula (bigint fixed-point with PRECISION = 10^18):
  // reward = pool * (timeDelta / votingDuration / 2 + 1 / voterCount / 2)
  // Uses voterRewardPool (fixed post-burn pool, immutable since dao_vote_result) so all
  // claimants get the same base regardless of order.
  const timePart = (timeDelta * PRECISION) / votingDuration
  const equalPart = PRECISION / N
  const rewardNumerator = proposal.voterRewardPool * (timePart + equalPart)
  let reward = rewardNumerator / (2n * PRECISION)

  // Cap at remaining unclaimed pool to prevent rounding over-distribution
  const remainingPool = SafeBigIntMath.subtract(proposal.voterRewardPool, proposal.claimedAmount)
  if (reward > remainingPool) {
    reward = remainingPool
  }

  const txFeeWei = utils.getTransactionFeeWei(AccountsStorage.cachedNetworkAccount)

  // Credit reward, deduct tx fee, and accumulate the claimed total
  from.data.balance = (from.data.balance ?? 0n) + reward
  from.data.balance = SafeBigIntMath.subtract(from.data.balance, txFeeWei)
  proposal.claimedAmount = proposal.claimedAmount + reward
  proposal.claimList.push(tx.from)

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
      reward: reward.toString(),
      claimedAmount: proposal.claimedAmount.toString(),
      remainingPool: SafeBigIntMath.subtract(proposal.voterRewardPool, proposal.claimedAmount).toString(),
    },
  }
  const appReceiptDataHash = crypto.hashObj(appReceiptData)
  dapp.applyResponseAddReceiptData(applyResponse, appReceiptData, appReceiptDataHash)
  dapp.log('Applied dao_claim_reward tx', tx.from, tx.proposalId, reward.toString())
}

export const createFailedAppReceiptData = (
  tx: Tx.DaoClaimReward,
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

export const keys = (tx: Tx.DaoClaimReward, result: ShardusTypes.TransactionKeys): ShardusTypes.TransactionKeys => {
  result.sourceKeys = [tx.from]
  result.targetKeys = [tx.proposalId]
  result.allKeys = [...result.sourceKeys, ...result.targetKeys]
  return result
}

export const memoryPattern = (tx: Tx.DaoClaimReward, result: ShardusTypes.TransactionKeys): ShardusTypes.ShardusMemoryPatternsInput => {
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
  tx: Tx.DaoClaimReward,
  accountCreated = false,
): ShardusTypes.WrappedResponse => {
  if (!account) {
    throw new Error(`dao_claim_reward.createRelevantAccount: account ${accountId} does not exist`)
  }
  return dapp.createWrappedResponse(accountId, accountCreated, account.hash, account.timestamp, account)
}
