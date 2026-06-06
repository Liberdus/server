import * as crypto from '../crypto'
import { Shardus, ShardusTypes } from '@shardus/core'
import create from '../accounts'
import * as config from '../config'
import { UserAccount, WrappedStates, Tx, AppReceiptData, DaoProposalAccount } from '../@types'
import { SafeBigIntMath } from '../utils/safeBigIntMath'
import * as AccountsStorage from '../storage/accountStorage'
import * as utils from '../utils'
import { isUserAccount, isDaoProposalAccount } from '../@types/accountTypeGuards'
import { LiberdusFlags } from '../config'
import { getVotingEnd } from '../accounts/daoProposalAccount'

export const validate_fields = (tx: Tx.DaoVoteResult, response: ShardusTypes.IncomingTransactionResult): ShardusTypes.IncomingTransactionResult => {
  if (!LiberdusFlags.enableNewDAOTransactions) {
    response.reason = 'New DAO transactions are not enabled'
    return response
  }
  if (utils.isValidAddress(tx.from) === false) {
    response.reason = 'tx "from" is not a valid address'
    return response
  }
  if (typeof tx.proposalId !== 'string' || tx.proposalId.length !== 64) {
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
  tx: Tx.DaoVoteResult,
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
  if (tx.timestamp <= getVotingEnd(proposal)) {
    response.reason = 'Voting period has not ended yet'
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
  tx: Tx.DaoVoteResult,
  txTimestamp: number,
  txId: string,
  wrappedStates: WrappedStates,
  dapp: Shardus,
  applyResponse: ShardusTypes.ApplyResponse,
): void => {
  const from: UserAccount = wrappedStates[tx.from].data as unknown as UserAccount
  const proposal: DaoProposalAccount = wrappedStates[tx.proposalId].data as unknown as DaoProposalAccount
  const txFeeWei = utils.getTransactionFeeWei(AccountsStorage.cachedNetworkAccount)

  from.data.balance = SafeBigIntMath.subtract(from.data.balance, txFeeWei)

  // Find the winning option: highest weight wins; lower index wins on tie
  let winnerIndex = 0
  for (let i = 1; i < proposal.weights.length; i++) {
    if ((proposal.weights[i] ?? 0n) > (proposal.weights[winnerIndex] ?? 0n)) {
      winnerIndex = i
    }
  }

  const winningOption = proposal.options[winnerIndex]
  // Convention: index 0 is the affirmative option ('yes' or equivalent)
  proposal.status = winnerIndex === 0 ? 'accepted' : 'rejected'

  // Burn pctBurned% of the voter reward pool (reduce pool; coins leave circulation)
  const burnAmount = (proposal.voterRewardPool * BigInt(proposal.pctBurned)) / 100n
  proposal.voterRewardPool = proposal.voterRewardPool - burnAmount
  // Snapshot the post-burn pool so all claimants use the same fixed base regardless of claim order
  proposal.rewardPoolAfterBurn = proposal.voterRewardPool

  from.timestamp = txTimestamp
  proposal.timestamp = txTimestamp

  const appReceiptData: AppReceiptData = {
    txId,
    timestamp: txTimestamp,
    success: true,
    from: tx.from,
    type: tx.type,
    transactionFee: txFeeWei,
    additionalInfo: {
      proposalId: tx.proposalId,
      winningOption,
      status: proposal.status,
      burnAmount: burnAmount.toString(),
      remainingPool: proposal.voterRewardPool.toString(),
    },
  }
  const appReceiptDataHash = crypto.hashObj(appReceiptData)
  dapp.applyResponseAddReceiptData(applyResponse, appReceiptData, appReceiptDataHash)
  dapp.log('Applied dao_vote_result tx', tx.proposalId, proposal.status, 'winner:', winningOption)
}

export const createFailedAppReceiptData = (
  tx: Tx.DaoVoteResult,
  txTimestamp: number,
  txId: string,
  wrappedStates: WrappedStates,
  dapp: Shardus,
  applyResponse: ShardusTypes.ApplyResponse,
  reason: string,
): void => {
  const appReceiptData: AppReceiptData = {
    txId,
    timestamp: txTimestamp,
    success: false,
    reason,
    from: tx.from,
    type: tx.type,
    transactionFee: BigInt(0),
  }
  const appReceiptDataHash = crypto.hashObj(appReceiptData)
  dapp.applyResponseAddReceiptData(applyResponse, appReceiptData, appReceiptDataHash)
}

export const keys = (tx: Tx.DaoVoteResult, result: ShardusTypes.TransactionKeys): ShardusTypes.TransactionKeys => {
  result.sourceKeys = [tx.from]
  result.targetKeys = [tx.proposalId]
  result.allKeys = [...result.sourceKeys, ...result.targetKeys]
  return result
}

export const memoryPattern = (tx: Tx.DaoVoteResult, result: ShardusTypes.TransactionKeys): ShardusTypes.ShardusMemoryPatternsInput => {
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
  tx: Tx.DaoVoteResult,
  accountCreated = false,
): ShardusTypes.WrappedResponse => {
  if (!account) {
    account = create.userAccount(accountId, tx.timestamp)
    accountCreated = true
  }
  return dapp.createWrappedResponse(accountId, accountCreated, account.hash, account.timestamp, account)
}
