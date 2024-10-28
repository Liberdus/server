import * as crypto from '@shardus/crypto-utils'
import { UserAccount } from '../@types'

export const userAccount = (accountId: string, timestamp: number) => {
  const account: UserAccount = {
    id: accountId,
    type: 'UserAccount',
    data: {
      balance: BigInt(50),
      stake: BigInt(0),
      remove_stake_request: null,
      toll: null,
      chats: {},
      friends: {},
      payments: [],
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
