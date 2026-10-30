import { nestedCountersInstance } from '@shardus/core'
import { LiberdusFlags } from '../../config'
import { Migration } from '../types'

/**
 * Enables the corrected binary serializers for factory-built account types.
 *
 * The corrected layouts reuse the existing numeric tags, and older builds cannot decode them. Roll out in order:
 * 1. Raise minVersion and latestVersion to 2.5.3 so older builds can no longer join.
 * 2. Wait until every active node runs a 2.5.3 build; minVersion does not remove nodes that are already active.
 * 3. Raise activeVersion to 2.5.3, which runs this migration.
 *
 * A network that starts at 2.5.3 never runs this migration; enable correctAccountSerdeLayout in its defaults before launch.
 */
export const migrate: Migration = async () => {
  console.log('migrate 2.5.3')
  nestedCountersInstance.countEvent('migrate', 'calling migrate 2.5.3')
  LiberdusFlags.versionFlags.correctAccountSerdeLayout = true
}
