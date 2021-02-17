import stringify from 'fast-stable-stringify'
import Shardus from 'shardus-global-server/src/shardus/shardus-types'

export const validate_fields = (tx: Tx.InitNetwork, response: Shardus.IncomingTransactionResult) => {
  return response
}

export const validate = (tx: Tx.InitNetwork, wrappedStates: WrappedStates, response: Shardus.IncomingTransactionResult, dapp: Shardus) => {
  response.success = true
  response.reason = 'This transaction is valid'
  return response
}

export const apply = (tx: Tx.InitNetwork, txId: string, wrappedStates: WrappedStates, dapp: Shardus) => {
  const network: NetworkAccount = wrappedStates[tx.network].data
  network.timestamp = tx.timestamp
  console.log(`init_network NETWORK_ACCOUNT: ${stringify(network)}`)
  // from.timestamp = tx.timestamp
  dapp.log('Applied init_network transaction', network)
}

export const keys = (tx: Tx.InitNetwork, result: TransactionKeys) => {
  // result.sourceKeys = [tx.from]
  result.targetKeys = [tx.network]
  result.allKeys = [...result.sourceKeys, ...result.targetKeys]
  return result
}
