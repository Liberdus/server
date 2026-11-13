import { nestedCountersInstance } from '@shardus/core'
import { LiberdusFlags } from '../../config'
import { Migration } from '../types'

/**
 * Enables JSON fallback serialization for all account types, including DAO accounts.
 *
 * Ordinary accounts already use the fallback; DAO accounts use tagged serializers until activation.
 * Both formats remain readable during rollout. Roll out in order:
 * 1. Raise minVersion and latestVersion to 2.5.3 so older builds can no longer join.
 * 2. Wait until every active node runs a 2.5.3 build; minVersion does not remove nodes that are already active.
 * 3. Raise activeVersion to 2.5.3, which runs this migration.
 *
 * It also turns on AJV schema validation for txs, app join data, standby checks and penalty data,
 * plus Shardus network configuration checks.
 *
 * A network that starts at 2.5.3 never runs this migration; enable useFallbackAccountSerialization,
 * enableAJVValidation, netConfigV2 and networkConfigHashEnforcement in its defaults before launch.
 */
export const migrate: Migration = async (dapp) => {
  console.log('migrate 2.5.3')
  nestedCountersInstance.countEvent('migrate', 'calling migrate 2.5.3')
  LiberdusFlags.versionFlags.useFallbackAccountSerialization = true
  LiberdusFlags.enableAJVValidation = true
  dapp.config.p2p.netConfigV2 = true
  dapp.config.p2p.networkConfigHashEnforcement = true
}
