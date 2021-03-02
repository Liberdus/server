import * as crypto from 'shardus-crypto-utils'
import Shardus from 'shardus-global-server/src/shardus/shardus-types'
import * as config from '../config'
import stringify from 'fast-stable-stringify'
import create from '../accounts'

export const validate_fields = (tx: Tx.DevPayment, response: Shardus.IncomingTransactionResult) => {
  if (typeof tx.network !== 'string') {
    response.success = false
    response.reason = 'tx "network" field must be a string.'
    throw new Error(response.reason)
  }
  if (tx.network !== config.networkAccount) {
    response.success = false
    response.reason = 'tx "network" field must be: ' + config.networkAccount
    throw new Error(response.reason)
  }
  if (typeof tx.from !== 'string') {
    response.success = false
    response.reason = 'tx "from" field must be a string.'
    throw new Error(response.reason)
  }
  if (typeof tx.nodeId !== 'string') {
    response.success = false
    response.reason = 'tx "nodeId" field must be a string.'
    throw new Error(response.reason)
  }
  if (typeof tx.payment !== 'object') {
    response.success = false
    response.reason = 'tx "payment" field must be an object.'
    throw new Error(response.reason)
  }
  if (typeof tx.developer !== 'string') {
    response.success = false
    response.reason = 'tx "developer" field must be a string.'
    throw new Error(response.reason)
  }
  if (typeof tx.payment.id !== 'string') {
    response.success = false
    response.reason = 'tx "payment.id" must be a string.'
    throw new Error(response.reason)
  }
  if (typeof tx.payment.address !== 'string') {
    response.success = false
    response.reason = 'tx "payment.address" must be a string.'
    throw new Error(response.reason)
  }
  if (typeof tx.payment.amount !== 'number') {
    response.success = false
    response.reason = 'tx "payment.amount" must be a number.'
    throw new Error(response.reason)
  }
  if (typeof tx.payment.delay !== 'number') {
    response.success = false
    response.reason = 'tx "payment.delay" must be a number.'
    throw new Error(response.reason)
  }
  if (typeof tx.payment.timestamp !== 'number') {
    response.success = false
    response.reason = 'tx "payment.timestamp" must be a number.'
    throw new Error(response.reason)
  }
  return response
}

export const validate = (tx: Tx.DevPayment, wrappedStates: WrappedStates, response: Shardus.IncomingTransactionResult, dapp: Shardus) => {
  const from: Accounts = wrappedStates[tx.from] && wrappedStates[tx.from].data
  const network: NetworkAccount = wrappedStates[tx.network].data
  const developer: UserAccount = wrappedStates[tx.developer] && wrappedStates[tx.developer].data
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
  if (tx.timestamp < tx.payment.timestamp) {
    response.reason = 'This payment is not ready to be released'
    return response
  }
  if (network.id !== config.networkAccount) {
    response.reason = 'To account must be the network account'
    return response
  }
  if (!network.developerFund.some((payment: DeveloperPayment) => payment.id === tx.payment.id)) {
    response.reason = 'This payment doesnt exist'
    return response
  }
  if (!developer || !developer.data) {
    response.reason = `No account exists for the passed in tx.developer ${tx.developer}`
    return response
  }
  if (tx.developer !== tx.payment.address) {
    response.reason = `tx developer ${tx.developer} does not match address in payment ${tx.payment.address}`
    return response
  }
  if (developer.data.payments.some(payment => payment.id === tx.payment.id)) {
    response.reason = `This payment ${stringify(tx.payment)} has already been given to the developer ${tx.developer}`
    return response
  }
  response.success = true
  response.reason = 'This transaction is valid!'
  return response
}

export const apply = (tx: Tx.DevPayment, txId: string, wrappedStates: WrappedStates, dapp) => {
  const from: UserAccount = wrappedStates[tx.from].data
  const network: NetworkAccount = wrappedStates[tx.network].data
  const developer: UserAccount = wrappedStates[tx.developer].data
  developer.data.payments.push(tx.payment)
  developer.data.balance += tx.payment.amount
  developer.data.transactions.push({ ...tx, txId })

  const when = tx.timestamp + config.ONE_SECOND * 10

  dapp.setGlobal(
    config.networkAccount,
    {
      type: 'apply_developer_payment',
      timestamp: when,
      network: config.networkAccount,
      developerFund: network.developerFund.filter((payment: DeveloperPayment) => payment.id !== tx.payment.id),
    },
    when,
    config.networkAccount,
  )

  developer.timestamp = tx.timestamp
  from.timestamp = tx.timestamp
  dapp.log('Applied developer_payment tx', from, developer, tx.payment)
}

export const keys = (tx: Tx.DevPayment, result: TransactionKeys) => {
  result.sourceKeys = [tx.from]
  result.targetKeys = [tx.developer, tx.network]
  result.allKeys = [...result.sourceKeys, ...result.targetKeys]
  return result
}

export const createRelevantAccount = (dapp: Shardus, account: NodeAccount, accountId: string, tx: Tx.DevPayment, accountCreated = false) => {
  if (!account) {
    account = create.nodeAccount(accountId)
    accountCreated = true
  }
  return dapp.createWrappedResponse(accountId, accountCreated, account.hash, account.timestamp, account)
}