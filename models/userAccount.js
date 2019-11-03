import crypto from 'shardus-crypto-utils'

export const createUserAccount = (obj = {}) => {
  const account = Object.assign({
    id: crypto.randomBytes(),
    timestamp: Date.now(),
    balance: 0
  })
  account.hash = crypto.hashObj(account)
  return account
}
