import { nestedCountersInstance } from '@shardus/core'
import { Migration } from '../types'
import { LiberdusFlags } from '../../config'

export const migrate: Migration = async () => {
  console.log('migrate 2.5.1')
  nestedCountersInstance.countEvent('migrate', 'calling migrate 2.5.1')

  LiberdusFlags.enableNewDAOTransactions = true
}
