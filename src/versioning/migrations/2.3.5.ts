import { nestedCountersInstance } from '@shardeum-foundation/core'
import { Migration } from '../types'
import config, { LiberdusFlags } from '../../config'

// This has been baked into settings and is not needed, but the goal is to keep one migration as
// an example for when we need to migrate again.

export const migrate: Migration = async () => {
  console.log('migrate 2.3.5')
  nestedCountersInstance.countEvent('migrate', 'calling migrate 2.3.5')

  config.server.stateManager.removeStuckTxsFromQueue = false
  config.server.stateManager.removeStuckTxsFromQueue2 = false
  config.server.stateManager.removeStuckTxsFromQueue3 = false
}

//WARNING if you add a new one of these migration files you must add it to the migrations list in
// src/versioning/index.ts
