import { nestedCountersInstance, Shardus } from '@shardeum-foundation/core'
import { addStakeCert, CertSignaturesResult, queryCertificateHandler } from '../../transactions/staking/query_certificate'
import { LiberdusFlags } from '../../config'
import { Utils } from '@shardeum-foundation/lib-types'
import { logFlags } from '@shardeum-foundation/core/dist/logger'
import { ValidatorError } from '../../@types'

export const queryCertificate =
  (dapp: Shardus) =>
  async (req, res): Promise<void> => {
    try {
      nestedCountersInstance.countEvent('liberdus-staking', 'called query-certificate')
      const queryCertRes = await queryCertificateHandler(req, dapp)
      if (LiberdusFlags.VerboseLogs) console.log('queryCertRes', queryCertRes)
      if (queryCertRes.success) {
        addStakeCert((queryCertRes as CertSignaturesResult).signedStakeCert)
        /* prettier-ignore */ nestedCountersInstance.countEvent('liberdus-staking', `queryCertificateHandler success`)
      } else {
        /* prettier-ignore */ nestedCountersInstance.countEvent('liberdus-staking', `queryCertificateHandler failed with reason: ${(queryCertRes as ValidatorError).reason}`)
      }

      return res.json(Utils.safeJsonParse(Utils.safeStringify(queryCertRes)))
    } catch (error) {
      /* prettier-ignore */ if (logFlags.error) console.error('Error in processing query-certificate request:', error)
      res.status(500).json({ error: 'Internal Server Error' })
    }
  }
