import { AJVSchemaEnum } from '../../@types';
import { verifyPayload } from '../../@types/ajvHelper';
import { LiberdusFlags } from '../../config'
import * as AccountsStorage from '../../storage/accountStorage'
import { getStakeRequiredWei } from '../../utils'
import { nestedCountersInstance } from '@shardus/core'

export const stake =
  () =>
  async (req, res): Promise<void> => {
    try {
      const stakeRequired = getStakeRequiredWei(AccountsStorage.cachedNetworkAccount)

      const response = {
        stakeRequired: {
          dataType: 'bi',
          value: stakeRequired.toString(16).padStart(16, '0'),
        },
        stakeRequiredUsd: {
          dataType: 'bi',
          value: stakeRequired.toString(16).padStart(16, '0'),
        },
      }

      const errors = verifyPayload(AJVSchemaEnum.stake_resp, response)

      if (errors !== null) {
        throw new Error(`Invalid stake response: ${errors.join('; ')}`)
      }
      res.json(response)
    } catch (e) {
      if (LiberdusFlags.VerboseLogs) console.log(`Error /stake`, e)
      nestedCountersInstance.countEvent('stake-api-error', e.message)
      res.status(500).send(e.message)
    }
  }
