import * as crypto from 'shardus-crypto-utils'
import Shardus from 'shardus-global-server/src/shardus/shardus-types'

export const validate_fields = (tx: Tx.SnapshotClaim, response: Shardus.IncomingTransactionResult) => {
    if (typeof tx.from !== 'string') {
        response.success = false
        response.reason = '"From" must be a string.'
        throw new Error(response.reason)
    }
    if (typeof tx.network !== 'string') {
        response.success = false
        response.reason = '"Network" must be a string.'
        throw new Error(response.reason)
    }
    return response
}

export const validate = (tx: Tx.SnapshotClaim, wrappedStates: WrappedStates, response: Shardus.IncomingTransactionResult, dapp: Shardus) => {
    const from: UserAccount = wrappedStates[tx.from] && wrappedStates[tx.from].data
    const network: NetworkAccount = wrappedStates[tx.network] && wrappedStates[tx.network].data
    if (from === undefined || from === null) {
        response.reason = "from account doesn't exist"
        return response
    }
    if (tx.sign.owner !== tx.from) {
        response.reason = 'not signed by from account'
        return response
    }
    if (crypto.verifyObj(tx) === false) {
        response.reason = 'incorrect signing'
        return response
    }
    if (from.claimedSnapshot) {
        response.reason = 'Already claimed tokens from the snapshot'
        return response
    }
    if (!network) {
        response.reason = 'Snapshot account does not exist yet, OR wrong snapshot address provided in the "to" field'
        return response
    }
    if (!network.snapshot) {
        response.reason = 'Snapshot hasnt been taken yet'
        return response
    }
    if (!network.snapshot[tx.from]) {
        response.reason = 'Your address did not hold any ULT on the Ethereum blockchain during the snapshot'
        return response
    }
    response.success = true
    response.reason = 'This transaction is valid!'
    return response
}

export const apply = (tx: Tx.SnapshotClaim, txId: string, wrappedStates: WrappedStates, dapp: Shardus) => {
    const from: UserAccount = wrappedStates[tx.from].data
    const network: NetworkAccount = wrappedStates[tx.network].data
    from.data.balance += network.snapshot[tx.from]
    network.snapshot[tx.from] = 0
    // from.data.transactions.push({ ...tx, txId })
    from.claimedSnapshot = true
    from.timestamp = tx.timestamp
    network.timestamp = tx.timestamp
    dapp.log('Applied snapshot_claim tx', from, network)
}

export const keys = (tx: Tx.SnapshotClaim, result: TransactionKeys) => {
    result.sourceKeys = [tx.from]
    result.targetKeys = [tx.network]
    result.allKeys = [...result.sourceKeys, ...result.targetKeys]
    return result
}