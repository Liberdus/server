import { nestedCountersInstance } from '@shardus/core'
import { Migration } from '../types'
import config, { LiberdusFlags } from '../../config'

// This has been baked into settings and is not needed, but the goal is to keep one migration as
// an example for when we need to migrate again.

export const migrate: Migration = async () => {
  console.log('migrate 2.3.2')
  nestedCountersInstance.countEvent('migrate', 'calling migrate 2.3.2')

  // this enables to save accounts in the DB instead of in memory
  LiberdusFlags.UseDBForAccounts = true

  // this enables the standby list to use a new form of calculation
  config.server.p2p.standbyListFastHash = true
}

//WARNING if you add a new one of these migration files you must add it to the migrations list in
// src/versioning/index.ts
