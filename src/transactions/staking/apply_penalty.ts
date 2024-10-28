import { LiberdusFlags } from '../../config'
import { NodeAccount } from '../../@types'
import * as AccountsStorage from '../../storage/accountStorage'
import { scaleByStabilityFactor } from '../../utils'
export function isLowStake(nodeAccount: NodeAccount): boolean {
  /**
   * IMPORTANT FUTURE TO-DO =:
   * This function's logic needs to be updated once `stakeRequiredUsd` actually represents
   * USD value rather than SHM.
   */

  const stakeRequiredUSD = AccountsStorage.cachedNetworkAccount.current.stakeRequiredUsd
  const lowStakeThresholdUSD = (stakeRequiredUSD * BigInt(LiberdusFlags.lowStakePercent * 100)) / BigInt(100)
  const lowStakeThreshold = scaleByStabilityFactor(lowStakeThresholdUSD, AccountsStorage.cachedNetworkAccount)

  return nodeAccount.stakeLock < lowStakeThreshold
}
