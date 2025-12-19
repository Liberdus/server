import { nestedCountersInstance } from '@shardus/core'
import { Migration } from '../types'
import { LiberdusFlags } from '../../config'

export const migrate: Migration = async () => {
  console.log('migrate 2.4.8')
  nestedCountersInstance.countEvent('migrate', 'calling migrate 2.4.8')

  LiberdusFlags.versionFlags.weiToLibStringFormat = true
  LiberdusFlags.versionFlags.nodeRewardedStatusCheck = true
  LiberdusFlags.versionFlags.includeTxToKeyInReadTx = true
}
