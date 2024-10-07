import * as crypto from '@shardus/crypto-utils'
import {NodeAccount} from '../@types'

export const nodeAccount = (accountId: string) => {
  const account: NodeAccount = {
    id: accountId,
    type: 'NodeAccount',
    balance: 0,
    nodeRewardTime: 0,
    hash: '',
    timestamp: 0,
  }
  account.hash = crypto.hashObj(account)
  return account
}
