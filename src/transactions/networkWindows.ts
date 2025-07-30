import stringify from 'fast-stable-stringify'
import { Shardus, ShardusTypes } from '@shardeum-foundation/core'
import * as config from '../config'
import create from '../accounts'
import { NodeAccount, UserAccount, NetworkAccount, IssueAccount, WrappedStates, OurAppDefinedData, Tx, TransactionKeys, AppReceiptData } from '../@types'
import * as crypto from '../crypto'

export const validate_fields = (tx: Tx.NetworkWindows, response: ShardusTypes.IncomingTransactionResult) => {
  response.success = true
  return response
}

export const validate = (tx: Tx.NetworkWindows, wrappedStates: WrappedStates, response: ShardusTypes.IncomingTransactionResult, dapp: Shardus) => {
  const network: NetworkAccount = wrappedStates[config.networkAccount].data

  if (network.id !== config.networkAccount) {
    response.reason = "Network account Id doesn't match the configuration"
    return response
  }

  response.success = true
  response.reason = 'This transaction is valid'
  return response
}

export const apply = (
  tx: Tx.NetworkWindows,
  txTimestamp: number,
  txId: string,
  wrappedStates: WrappedStates,
  dapp: Shardus,
  applyResponse: ShardusTypes.ApplyResponse,
): void => {
  const from: NodeAccount = wrappedStates[tx.from].data
  const network: NetworkAccount = wrappedStates[config.networkAccount].data

  const when = txTimestamp + config.ONE_SECOND * 10
  const windowsStartTime = when + config.ONE_SECOND * 10
  const { windows, devWindows } = getWindows(windowsStartTime, network)
  const value = {
    type: 'apply_parameters',
    timestamp: when,
    networkId: config.networkAccount,
    current: network.current,
    windows,
    devWindows,
    next: {},
    nextWindows: {},
    issue: network.issue,
  } as Tx.ApplyParameters

  const addressHash = wrappedStates[config.networkAccount].stateId
  const ourAppDefinedData = applyResponse.appDefinedData as OurAppDefinedData
  // [TODO] - Calculate the afterStateHash if old DAO is active
  const afterStateHash = ''
  ourAppDefinedData.globalMsg = { address: config.networkAccount, addressHash, value, when, source: from.id, afterStateHash }

  from.timestamp = txTimestamp

  const appReceiptData: AppReceiptData = {
    txId,
    timestamp: txTimestamp,
    success: true,
    from: tx.from,
    to: config.networkAccount,
    type: tx.type,
    transactionFee: BigInt(0),
  }
  const appReceiptDataHash = crypto.hashObj(appReceiptData)
  dapp.applyResponseAddReceiptData(applyResponse, appReceiptData, appReceiptDataHash)
  dapp.log(`Apply network_windows tx ${txId} value`, value)
}

export const createFailedAppReceiptData = (
  tx: Tx.NetworkWindows,
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
    to: config.networkAccount,
    type: tx.type,
    transactionFee: BigInt(0),
  }
  const appReceiptDataHash = crypto.hashObj(appReceiptData)
  dapp.applyResponseAddReceiptData(applyResponse, appReceiptData, appReceiptDataHash)
}

export const keys = (tx: Tx.NetworkWindows, result: TransactionKeys) => {
  result.sourceKeys = [tx.from]
  result.targetKeys = [config.networkAccount]
  result.allKeys = [...result.sourceKeys, ...result.targetKeys]
  return result
}

export const memoryPattern = (tx: Tx.NetworkWindows, result: TransactionKeys): ShardusTypes.ShardusMemoryPatternsInput => {
  return {
    rw: [tx.from],
    wo: [],
    on: [],
    ri: [],
    ro: [config.networkAccount],
  }
}

export const transactionReceiptPass = (
  tx: Tx.ChangeConfig,
  txId: string,
  wrappedStates: WrappedStates,
  dapp: Shardus,
  applyResponse: ShardusTypes.ApplyResponse,
): void => {
  const { address, addressHash, value, when, source, afterStateHash } = (applyResponse.appDefinedData as OurAppDefinedData).globalMsg
  dapp.setGlobal(address, addressHash, value, when, source, afterStateHash)
  dapp.log('PostApplied network_windows tx', address, value)
}

export const createRelevantAccount = (
  dapp: Shardus,
  account: NodeAccount | NetworkAccount,
  accountId: string,
  tx: Tx.NetworkWindows,
  accountCreated = false,
) => {
  if (!account) {
    if (accountId === config.networkAccount) {
      account = create.networkAccount(accountId, tx.timestamp, dapp)
    } else if (accountId === tx.from) {
      account = create.nodeAccount(accountId)
    }
    accountCreated = true
  }
  return dapp.createWrappedResponse(accountId, accountCreated, account.hash, account.timestamp, account)
}

const setWindows = (timestamp: number, network: NetworkAccount) => {
  const proposalWindow = [timestamp, timestamp + config.TIME_FOR_PROPOSALS]
  const votingWindow = [proposalWindow[1], proposalWindow[1] + config.TIME_FOR_VOTING]
  const graceWindow = [votingWindow[1], votingWindow[1] + config.TIME_FOR_GRACE]
  const applyWindow = [graceWindow[1], graceWindow[1] + config.TIME_FOR_APPLY]

  const devProposalWindow = [timestamp, timestamp + config.TIME_FOR_DEV_PROPOSALS]
  const devVotingWindow = [devProposalWindow[1], devProposalWindow[1] + config.TIME_FOR_DEV_VOTING]
  const devGraceWindow = [devVotingWindow[1], devVotingWindow[1] + config.TIME_FOR_DEV_GRACE]
  const devApplyWindow = [devGraceWindow[1], devGraceWindow[1] + config.TIME_FOR_DEV_APPLY]

  network.windows = {
    proposalWindow,
    votingWindow,
    graceWindow,
    applyWindow,
  }
  network.devWindows = {
    devProposalWindow,
    devVotingWindow,
    devGraceWindow,
    devApplyWindow,
  }
  network.next = {}
  network.nextWindows = {}
}

const getWindows = (timestamp: number, network: NetworkAccount) => {
  const proposalWindow = [timestamp, timestamp + config.TIME_FOR_PROPOSALS]
  const votingWindow = [proposalWindow[1], proposalWindow[1] + config.TIME_FOR_VOTING]
  const graceWindow = [votingWindow[1], votingWindow[1] + config.TIME_FOR_GRACE]
  const applyWindow = [graceWindow[1], graceWindow[1] + config.TIME_FOR_APPLY]

  const devProposalWindow = [timestamp, timestamp + config.TIME_FOR_DEV_PROPOSALS]
  const devVotingWindow = [devProposalWindow[1], devProposalWindow[1] + config.TIME_FOR_DEV_VOTING]
  const devGraceWindow = [devVotingWindow[1], devVotingWindow[1] + config.TIME_FOR_DEV_GRACE]
  const devApplyWindow = [devGraceWindow[1], devGraceWindow[1] + config.TIME_FOR_DEV_APPLY]

  const windows = {
    proposalWindow,
    votingWindow,
    graceWindow,
    applyWindow,
  }
  const devWindows = {
    devProposalWindow,
    devVotingWindow,
    devGraceWindow,
    devApplyWindow,
  }

  return { windows, devWindows }
}
