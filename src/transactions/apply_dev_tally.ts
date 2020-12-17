import stringify from 'fast-stable-stringify'
import Shardus from 'shardus-global-server/src/shardus/shardus-types'

export const validate_fields = (tx: Tx.ApplyDevTally, response: Shardus.IncomingTransactionResult) => {
  return response
}

export const validate = (tx: Tx.ApplyDevTally, wrappedStates: WrappedStates, response: Shardus.IncomingTransactionResult, dapp: Shardus) => {
  response.success = true
  response.reason = 'This transaction is valid!'
  return response
}

export const apply = (tx: Tx.ApplyDevTally, txId: string, wrappedStates: WrappedStates, dapp: Shardus) => {
  const network: NetworkAccount = wrappedStates[tx.network].data
  network.nextDeveloperFund = tx.nextDeveloperFund
  network.nextDevWindows = tx.nextDevWindows
  network.timestamp = tx.timestamp
  dapp.log(`=== APPLIED DEV_TALLY GLOBAL ${stringify(network)} ===`)
}

export const keys = (tx: Tx.ApplyDevTally, result: TransactionKeys) => {
  result.targetKeys = [tx.network]
  result.allKeys = [...result.sourceKeys, ...result.targetKeys]
  return result
}
