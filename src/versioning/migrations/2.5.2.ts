import { nestedCountersInstance } from '@shardus/core'
import { LiberdusFlags } from '../../config'
import { Migration } from '../types'

/** Enables deterministic lazy removal of persisted fields from the retired DAO system. */
export const migrate: Migration = async () => {
  console.log('migrate 2.5.2')
  nestedCountersInstance.countEvent('migrate', 'calling migrate 2.5.2')
  LiberdusFlags.versionFlags.removeLegacyDaoState = true
}
