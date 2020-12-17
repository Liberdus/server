import Shardus from 'shardus-global-server/src/shardus/shardus-types'
import * as config from '../config'

export const validate_fields = (tx: Tx.Parameters, response: Shardus.IncomingTransactionResult) => {
    return response
}

export const validate = (tx: Tx.Parameters, wrappedStates: WrappedStates, response: Shardus.IncomingTransactionResult, dapp: Shardus) => {
    const network: NetworkAccount = wrappedStates[tx.network].data
    const issue: IssueAccount = wrappedStates[tx.issue].data

    // let nodeInfo
    // try {
    //   nodeInfo = dapp.getNode(tx.nodeId)
    // } catch (err) {
    //   dapp.log(err)
    // }
    // if (!nodeInfo) {
    //   response.reason = 'no nodeInfo'
    //   return response
    // }
    if (network.id !== config.networkAccount) {
        response.reason = 'To account must be the network account'
        return response
    }
    if (!issue) {
        response.reason = "Issue doesn't exist"
        return response
    }
    if (issue.active === false) {
        response.reason = 'This issue is no longer active'
        return response
    }
    response.success = true
    response.reason = 'This transaction is valid!'
    return response
}

export const apply = (tx: Tx.Parameters, txId: string, wrappedStates: WrappedStates, dapp) => {
    const from: UserAccount = wrappedStates[tx.from].data
    const network: NetworkAccount = wrappedStates[tx.network].data
    const issue: IssueAccount = wrappedStates[tx.issue].data

    const when = tx.timestamp + config.ONE_SECOND * 10

    dapp.setGlobal(
        config.networkAccount,
        {
            type: 'apply_parameters',
            timestamp: when,
            network: config.networkAccount,
            current: network.next,
            next: {},
            windows: network.nextWindows,
            nextWindows: {},
            issue: network.issue + 1,
        },
        when,
        config.networkAccount,
    )

    issue.active = false

    from.timestamp = tx.timestamp
    issue.timestamp = tx.timestamp
    dapp.log('Applied parameters tx', issue)
}

export const keys = (tx: Tx.Parameters, result: TransactionKeys) => {
    result.sourceKeys = [tx.from]
    result.targetKeys = [tx.network, tx.issue]
    result.allKeys = [...result.sourceKeys, ...result.targetKeys]
    return result
}