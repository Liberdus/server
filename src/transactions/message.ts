import * as crypto from 'shardus-crypto-utils'
import Shardus from 'shardus-global-server/src/shardus/shardus-types'
import * as utils from '../utils'

export const validate_fields = (tx: Tx.Message, response: Shardus.IncomingTransactionResult) => {
  if (typeof tx.from !== 'string') {
    response.success = false
    response.reason = '"From" must be a string.'
    throw new Error(response.reason)
  }
  if (typeof tx.to !== 'string') {
    response.success = false
    response.reason = '"To" must be a string.'
    throw new Error(response.reason)
  }
  if (typeof tx.message !== 'string') {
    response.success = false
    response.reason = '"Message" must be a string.'
    throw new Error(response.reason)
  }
  if (tx.message.length > 5000) {
    response.success = false
    response.reason = '"Message" length must be less than 5000 characters.'
    throw new Error(response.reason)
  }
  return response
}

export const validate = (tx: Tx.Message, wrappedStates: WrappedStates, response: Shardus.IncomingTransactionResult, dapp: Shardus) => {
  const from: Accounts = wrappedStates[tx.from] && wrappedStates[tx.from].data
  const network: NetworkAccount = wrappedStates[tx.network].data
  const to: Accounts = wrappedStates[tx.to] && wrappedStates[tx.to].data
  if (tx.sign.owner !== tx.from) {
    response.reason = 'not signed by from account'
    return response
  }
  if (crypto.verifyObj(tx) === false) {
    response.reason = 'incorrect signing'
    return response
  }
  if (typeof from === 'undefined' || from === null) {
    response.reason = '"from" account does not exist.'
    return response
  }
  if (typeof to === 'undefined' || to === null) {
    response.reason = '"target" account does not exist.'
    return response
  }
  if (to.data.friends[tx.from]) {
    if (from.data.balance < network.current.transactionFee) {
      response.reason = `from account does not have sufficient funds: ${from.data.balance} to cover transaction fee: ${network.current.transactionFee}.`
      return response
    }
  } else {
    if (to.data.toll === null) {
      if (from.data.balance < network.current.defaultToll + network.current.transactionFee) {
        response.reason = `from account does not have sufficient funds ${from.data.balance} to cover the default toll + transaction fee ${network.current
          .defaultToll + network.current.transactionFee}.`
        return response
      }
    } else {
      if (from.data.balance < to.data.toll + network.current.transactionFee) {
        response.reason = 'from account does not have sufficient funds.'
        return response
      }
    }
  }
  response.success = true
  response.reason = 'This transaction is valid!'
  return response
}

export const apply = (tx: Tx.Message, txId: string, wrappedStates: WrappedStates, dapp: Shardus) => {
  const from: UserAccount = wrappedStates[tx.from].data
  const to: UserAccount = wrappedStates[tx.to].data
  const network: NetworkAccount = wrappedStates[tx.network].data
  const chat = wrappedStates[tx.chatId].data
  from.data.balance -= network.current.transactionFee
  if (!to.data.friends[from.id]) {
    if (to.data.toll === null) {
      from.data.balance -= network.current.defaultToll
      to.data.balance += network.current.defaultToll
    } else {
      from.data.balance -= to.data.toll
      to.data.balance += to.data.toll
    }
  }
  from.data.balance -= utils.maintenanceAmount(tx.timestamp, from, network)

  if (!from.data.chats[tx.to]) from.data.chats[tx.to] = tx.chatId
  if (!to.data.chats[tx.from]) to.data.chats[tx.from] = tx.chatId

  chat.messages.push(tx.message)
  from.data.transactions.push({ ...tx, txId })
  to.data.transactions.push({ ...tx, txId })

  chat.timestamp = tx.timestamp
  from.timestamp = tx.timestamp
  to.timestamp = tx.timestamp

  dapp.log('Applied message tx', chat, from, to)
}

export const keys = (tx: Tx.Message, result: TransactionKeys) => {
  result.sourceKeys = [tx.from]
  result.targetKeys = [tx.to, tx.chatId, tx.network]
  result.allKeys = [...result.sourceKeys, ...result.targetKeys]
  return result
}