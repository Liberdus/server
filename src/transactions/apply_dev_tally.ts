import { Utils } from '@shardus/types'
import { Shardus, ShardusTypes } from '@shardeum-foundation/core'
import create from '../accounts'
import * as config from '../config'
import _ from 'lodash'
import { Accounts, UserAccount, NetworkAccount, IssueAccount, WrappedStates, ProposalAccount, Tx, TransactionKeys, AppReceiptData } from '../@types'

export const validate_fields = (tx: Tx.ApplyDevTally, response: ShardusTypes.IncomingTransactionResult) => {
  if (!Array.isArray(tx.nextDeveloperFund)) {
    response.success = false
    response.reason = 'tx "nextDeveloperFund" field must be an array.'
    throw new Error(response.reason)
  }
  if (_.isEmpty(tx.nextDevWindows)) {
    response.success = false
    response.reason = 'tx "nextDevWindows" field cannot be an empty object.'
    throw new Error(response.reason)
  }
  return response
}

export const validate = (tx: Tx.ApplyDevTally, wrappedStates: WrappedStates, response: ShardusTypes.IncomingTransactionResult, dapp: Shardus) => {
  response.success = true
  response.reason = 'This transaction is valid!'
  return response
}

export const apply = (
  tx: Tx.ApplyDevTally,
  txTimestamp: number,
  txId: string,
  wrappedStates: WrappedStates,
  dapp: Shardus,
  applyResponse: ShardusTypes.ApplyResponse,
): void => {
  const network: NetworkAccount = wrappedStates[config.networkAccount].data
  network.nextDeveloperFund = tx.nextDeveloperFund
  network.nextDevWindows = tx.nextDevWindows
  network.timestamp = txTimestamp

  const appReceiptData: AppReceiptData = {
    txId,
    timestamp: txTimestamp,
    success: true,
    from: tx.from,
    to: config.networkAccount,
    type: tx.type,
    transactionFee: BigInt(0),
  }
  dapp.applyResponseAddReceiptData(applyResponse, appReceiptData, txId)
  dapp.log('Applied apply_dev_tally tx', tx, network)
}

export const keys = (tx: Tx.ApplyDevTally, result: TransactionKeys) => {
  result.targetKeys = [config.networkAccount]
  result.allKeys = [...result.sourceKeys, ...result.targetKeys]
  return result
}

export const memoryPattern = (tx: Tx.ApplyDevTally, result: TransactionKeys): ShardusTypes.ShardusMemoryPatternsInput => {
  return {
    rw: [config.networkAccount],
    wo: [],
    on: [],
    ri: [],
    ro: [],
  }
}

export const createRelevantAccount = (dapp: Shardus, account: NetworkAccount, accountId: string, tx: Tx.ApplyDevTally, accountCreated = false) => {
  if (!account) {
    throw new Error('Network Account must already exist for the apply_dev_tally transaction')
  }
  return dapp.createWrappedResponse(accountId, accountCreated, account.hash, account.timestamp, account)
}
