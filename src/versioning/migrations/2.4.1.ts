import { nestedCountersInstance } from '@shardus/core'
import { Migration } from '../types'
import { LiberdusFlags } from '../../config'
import { shardusConfig } from '../..'

// This has been baked into settings and is not needed, but the goal is to keep one migration as
// an example for when we need to migrate again.

export const migrate: Migration = async () => {
  console.log('migrate 2.4.1')
  nestedCountersInstance.countEvent('migrate', 'calling migrate 2.4.1')

  LiberdusFlags.versionFlags.createTxAppReceiptUpdate = true
  LiberdusFlags.versionFlags.addNewNetworkParameters = true
}

//WARNING if you add a new one of these migration files you must add it to the migrations list in
// src/versioning/index.ts
