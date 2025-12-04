import { NodeAccount, UserAccount } from '../../@types'
import { LiberdusFlags } from '../../config'
import { isStakeUnlocked } from '../../transactions/staking/withdraw_stake'
import { nestedCountersInstance, Shardus } from '@shardus/core'

export const canUnstake =
  (dapp: Shardus) =>
  async (req, res): Promise<void> => {
    try {
      const nominatorAddress = req.params['nominator']
      const nomineeAddress = req.params['nominee']

      const nominator = await dapp.getLocalOrRemoteAccount(nominatorAddress)
      const nominee = await dapp.getLocalOrRemoteAccount(nomineeAddress)
      if (nominee == null || nominator == null || nominator.data == null || nominee.data == null) {
        res.json({ error: 'account not found' })
        return
      }
      const stakeUnlocked = isStakeUnlocked(nominator.data as UserAccount, nominee.data as NodeAccount, dapp)

      res.json({ stakeUnlocked })
    } catch (e) {
      if (LiberdusFlags.VerboseLogs) console.log(`Error /canUnstake`, e)
      nestedCountersInstance.countEvent('canUnstake-api-error', e.message)
      res.status(500).send(e.message)
    }
  }
