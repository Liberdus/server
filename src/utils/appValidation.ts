import { nestedCountersInstance } from '@shardus/core'
import { P2P, Utils } from '@shardus/lib-types'
import { AJVSchemaEnum, AppJoinData, BaseLiberdusTx } from '../@types'
import { verifyPayload } from '../@types/ajvHelper'
import { LiberdusFlags } from '../config'
import * as AccountsStorage from '../storage/accountStorage'
import { isEqualOrNewerVersion, isEqualOrOlderVersion } from './index'

// Validation hooks used by shardusSetup in src/index.ts. They live here so unit tests can exercise them.

/** Returns the rejection reason when AJV validation is on and the tx does not match its schema, otherwise null. */
export function getTxSchemaError(tx: BaseLiberdusTx): string | null {
  if (!LiberdusFlags.enableAJVValidation) return null
  const errors = verifyPayload(tx.type, tx)
  if (errors == null) return null
  nestedCountersInstance.countEvent('external', `ajv-failed-${tx.type}-tx`)
  const reason = `AJV failed for ${tx.type} tx, errors: ${Utils.safeStringify(errors)}`
  if (LiberdusFlags.VerboseLogs) console.log(reason)
  return reason
}

export function verifyAppJoinData(data: unknown): string[] | null {
  if (!LiberdusFlags.enableAJVValidation) return null
  return verifyPayload(AJVSchemaEnum.app_join_data, data)
}

export function canStayOnStandby(joinInfo: P2P.JoinTypes.JoinRequest): { canStay: boolean; reason: string } {
  if (joinInfo) {
    const appJoinData = joinInfo?.appJoinData as AppJoinData

    if (AccountsStorage.cachedNetworkAccount == null) {
      //We need to enhance the early config getting to also get other values of the global account
      //so we know what versions the network is.  this is a stopgap!
      return { canStay: true, reason: 'dont have network account yet. cant boot anything!' }
    }

    // Every node evaluates this while building the cycle record, so the check stays behind the shared AJV flag
    if (LiberdusFlags.enableAJVValidation) {
      const errors = verifyPayload(AJVSchemaEnum.app_join_data, appJoinData)
      if (errors != null) {
        return { canStay: false, reason: `canStayOnStandby: invalid app join data: ${errors.join('; ')}` }
      }
    }

    const minVersion = AccountsStorage.cachedNetworkAccount.current.minVersion
    if (!isEqualOrNewerVersion(minVersion, appJoinData.version)) {
      /* prettier-ignore */
      if (LiberdusFlags.VerboseLogs) console.log(`validateJoinRequest fail: old version`)
      return {
        canStay: false,
        reason: `canStayOnStandby: standby node version: ${appJoinData.version} < minVersion ${minVersion}`,
      }
    }

    const latestVersion = AccountsStorage.cachedNetworkAccount.current.latestVersion

    if (latestVersion && appJoinData.version && !isEqualOrOlderVersion(latestVersion, appJoinData.version)) {
      /* prettier-ignore */
      if (LiberdusFlags.VerboseLogs) console.log(`validateJoinRequest fail: version number is newer than latest`)
      return {
        canStay: false,
        reason: `version number is newer than latest. The latest allowed app version is ${latestVersion}. Join request node app version is ${appJoinData.version}`,
        //fatal: true,
      }
    }
  }

  return { canStay: true, reason: '' }
}
