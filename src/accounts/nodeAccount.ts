import * as crypto from '@shardus/crypto-utils'
import {NodeAccount} from '../@types'

export const nodeAccount = (accountId: string) => {
  const account: NodeAccount = {
    id: accountId,
    type: 'NodeAccount',
    balance: BigInt(0),
    nodeRewardTime: 0,
    hash: '',
    timestamp: 0,
    nominator: null,
    stakeLock: BigInt(0),
    stakeTimestamp: 0,
    rewarded: false,
    penalty: BigInt(0),
    nodeAccountStats: {
      totalReward: BigInt(0),
      totalPenalty: BigInt(0),
      history: [],
      lastPenaltyTime: 0,
      penaltyHistory: [],
    },
    rewardStartTime: 0,
    rewardEndTime: 0,
    reward: BigInt(0),
    rewardRate: BigInt(0),
  }
  account.hash = crypto.hashObj(account)
  return account
}
