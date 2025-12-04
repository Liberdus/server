import { nestedCountersInstance } from '@shardus/core'
import { Migration } from '../types'
import { LiberdusFlags } from '../../config'

export const migrate: Migration = async () => {
  console.log('migrate 2.4.5')
  nestedCountersInstance.countEvent('migrate', 'calling migrate 2.4.5')

  LiberdusFlags.versionFlags.removeOperatorStatsHistory = true
}
