import crypto from 'shardus-crypto-utils'

export const validateTransaction = (tx, wrappedStates) => {
  const alias = wrappedStates[tx.id] && wrappedStates[tx.id].data
  const from = wrappedStates[tx.from] && wrappedStates[tx.from].data
  const to = wrappedStates[tx.to] && wrappedStates[tx.to].data

  const response = {
    result: 'fail',
    reason: 'Transaction is not valid.'
  }

  switch (tx.type) {
    case 'register': {
      if (tx.sign.owner !== tx.from) {
        response.reason = 'not signed by From account'
        return response
      }
      if (crypto.verifyObj(tx) === false) {
        response.reason = 'incorrect signing'
        return response
      }
      if (alias.inbox === tx.alias) {
        response.reason = 'This handle is already taken'
        return response
      }
      if (tx.alias && tx.alias.length >= 17) {
        response.reason = 'Alias must be less than 17 characters'
        return response
      }
      response.result = 'pass'
      response.reason = 'This transaction is valid!'
      return response
    }

    case 'transfer': {
      if (tx.sign.owner !== tx.from) {
        response.reason = 'Not signed by From account'
        return response
      }
      if (crypto.verifyObj(tx) === false) {
        response.reason = 'Incorrect signing'
        return response
      }
      if (from === undefined || from === null) {
        response.reason = "From account doesn't exist"
        return response
      }
      if (to === undefined || to === null) {
        response.reason = "To account doesn't exist"
        return response
      }
      if (from.data.balance < tx.amount) {
        response.reason = "From account doesn't have sufficient balance to cover the transaction"
        return response
      }
      response.result = 'pass'
      response.reason = 'This transaction is valid!'
      return response
    }
    default: {
      response.reason = '"type" must be "register", "create" or "transfer".'
      return response
    }
  }
}
