import Shardus from 'shardus-global-server/src/shardus/shardus-types'
import create from '../accounts'

export const validate_fields = (tx: Tx.GossipEmailHash, response: Shardus.IncomingTransactionResult) => {
  return response
}

export const validate = (tx: Tx.GossipEmailHash, wrappedStates: WrappedStates, response: Shardus.IncomingTransactionResult, dapp: Shardus) => {
  response.success = true
  response.reason = 'This transaction is valid!'
  return response
}

export const apply = (tx: Tx.GossipEmailHash, txId: string, wrappedStates: WrappedStates, dapp: Shardus) => {
  // const targets = tx.targets.map(target => wrappedStates[target].data)
  const account: UserAccount = wrappedStates[tx.account].data
  account.emailHash = tx.emailHash
  account.verified = tx.verified
  account.timestamp = tx.timestamp
  dapp.log('Applied gossip_email_hash tx', account)
}

export const keys = (tx: Tx.GossipEmailHash, result: TransactionKeys) => {
  result.sourceKeys = [tx.from]
  result.targetKeys = [tx.account]
  result.allKeys = [...result.sourceKeys, ...result.targetKeys]
  return result
}

export const createRelevantAccount = (dapp: Shardus, account: NodeAccount, accountId: string, tx: Tx.GossipEmailHash, accountCreated = false) => {
  if (!account) {
    account = create.nodeAccount(accountId)
    accountCreated = true
  }
  return dapp.createWrappedResponse(accountId, accountCreated, account.hash, account.timestamp, account)
}