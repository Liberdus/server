import stringify from 'fast-stable-stringify'
import Shardus from 'shardus-global-server/src/shardus/shardus-types'

export const validate_fields = (tx: Tx.ApplyParameters, response: Shardus.IncomingTransactionResult) => {
    return response
}

export const validate = (tx: Tx.ApplyParameters, wrappedStates: WrappedStates, response: Shardus.IncomingTransactionResult, dapp: Shardus) => {
    response.success = true
    response.reason = 'This transaction is valid!'
    return response
}

export const apply = (tx: Tx.ApplyParameters, txId: string, wrappedStates: WrappedStates, dapp: Shardus) => {
    const network: NetworkAccount = wrappedStates[tx.network].data
    network.current = tx.current
    network.next = tx.next
    network.windows = tx.windows
    network.nextWindows = tx.nextWindows
    network.issue = tx.issue
    network.timestamp = tx.timestamp
    dapp.log(`=== APPLIED PARAMETERS GLOBAL ${stringify(network)} ===`)
}

export const keys = (tx: Tx.ApplyParameters, result: TransactionKeys) => {
    result.targetKeys = [tx.network]
    result.allKeys = [...result.sourceKeys, ...result.targetKeys]
    return result
}