import { NodeAccount } from '../../@types'
import { LiberdusFlags } from '../../config'
import { isRestakingAllowed } from '../../transactions/staking/deposit_stake'
import { nestedCountersInstance, Shardus } from '@shardus/core'

export const canStake =
  (dapp: Shardus) =>
  async (req, res): Promise<void> => {
    try {
      const nomineeAddress = req.params['nominee']

      const nominee = await dapp.getLocalOrRemoteAccount(nomineeAddress)
      if (nominee == null || nominee.data == null) {
        res.json({ error: 'account not found' })
        return
      }
      const stakeAllowed = isRestakingAllowed(nominee.data as NodeAccount, dapp.shardusGetTime())

      res.json({ stakeAllowed })
    } catch (e) {
      if (LiberdusFlags.VerboseLogs) console.log(`Error /canStake`, e)
      nestedCountersInstance.countEvent('canStake-api-error', e.message)
      res.status(500).send(e.message)
    }
  }
