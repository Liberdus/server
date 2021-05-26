import * as crypto from 'shardus-crypto-utils'

export const userAccount = (accountId: string, timestamp: number) => {
  const account: UserAccount = {
    id: accountId,
    type: 'UserAccount',
    data: {
      balance: 50,
      stake: 0,
      remove_stake_request: null,
      toll: null,
      chats: {},
      transactions: [],
      payments: [],
      referrals: []
    },
    alias: null,
    emailHash: null,
    verified: false,
    hash: '',
    claimedSnapshot: false,
    lastMaintenance: timestamp,
    timestamp: 0,
  }
  account.hash = crypto.hashObj(account)
  return account
}
