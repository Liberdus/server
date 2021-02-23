import stringify from 'fast-stable-stringify'
import Shardus from 'shardus-global-server/src/shardus/shardus-types'
import create from '../accounts'

export const validate_fields = (tx: Tx.ApplyTally, response: Shardus.IncomingTransactionResult) => {
  return response
}

export const validate = (tx: Tx.ApplyTally, wrappedStates: WrappedStates, response: Shardus.IncomingTransactionResult, dapp: Shardus) => {
  response.success = true
  response.reason = 'This transaction is valid!'
  return response
}

export const apply = (tx: Tx.ApplyTally, txId: string, wrappedStates: WrappedStates, dapp: Shardus) => {
  const network: NetworkAccount = wrappedStates[tx.network].data
  network.next = tx.next
  network.nextWindows = tx.nextWindows
  network.timestamp = tx.timestamp
  dapp.log(`APPLIED TALLY GLOBAL ${stringify(network)} ===`)
}

export const keys = (tx: Tx.ApplyTally, result: TransactionKeys) => {
  result.targetKeys = [tx.network]
  result.allKeys = [...result.sourceKeys, ...result.targetKeys]
  return result
}

export const createRelevantAccount = (dapp: Shardus, account: NodeAccount, accountId: string, tx: Tx.ApplyTally, accountCreated = false) => {
  if (!account) {
    account = create.nodeAccount(accountId)
    accountCreated = true
  }
  return dapp.createWrappedResponse(accountId, accountCreated, account.hash, account.timestamp, account)
}