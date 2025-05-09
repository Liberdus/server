import { LiberdusFlags } from '../../config'
import * as AccountsStorage from '../../storage/accountStorage'
import { scaleByStabilityFactor } from '../../utils'
import { nestedCountersInstance } from '@shardeum-foundation/core'

export const stake =
  () =>
  async (req, res): Promise<void> => {
    try {
      const stakeRequiredUsd = AccountsStorage.cachedNetworkAccount.current.stakeRequiredUsd
      const stakeRequired = scaleByStabilityFactor(stakeRequiredUsd, AccountsStorage.cachedNetworkAccount)

      const response = {
        stakeRequired: {
          dataType: 'bi',
          value: stakeRequired.toString(16).padStart(16, '0'),
        },
        stakeRequiredUsd: {
          dataType: 'bi',
          value: stakeRequiredUsd.toString(16).padStart(16, '0'),
        },
      }
      res.json(response)
    } catch (e) {
      if (LiberdusFlags.VerboseLogs) console.log(`Error /stake`, e)
      nestedCountersInstance.countEvent('stake-api-error', e.message)
      res.status(500).send(e.message)
    }
  }
