import { Shardus, ShardusTypes, nestedCountersInstance } from '@shardeum-foundation/core'
import { LiberdusFlags } from '../config'
import * as crypto from '../crypto'
import { Request } from 'express'
import { DevSecurityLevel } from '@shardeum-foundation/core'
import { ValidatorError } from '../@types'

export interface AdminCert {
  nominee: string
  certCreation: number
  certExp: number
  sign: ShardusTypes.Sign
  goldenTicket: boolean
}

export type PutAdminCertRequest = AdminCert

export interface PutAdminCertResult {
  success: boolean
  reason?: string // error message if failed
}

export let adminCert: AdminCert = null

function validatePutAdminCertRequest(req: PutAdminCertRequest, shardus: Shardus): PutAdminCertResult {
  const publicKey = shardus.crypto.getPublicKey()

  if (!req.nominee || req.nominee === '' || req.nominee.length !== 64) {
    /* prettier-ignore */ nestedCountersInstance.countEvent('liberdus-admin-certificate', `validatePutAdminCertRequest fail req.nominee address invalid`)
    /* prettier-ignore */ if (LiberdusFlags.VerboseLogs) console.log('validatePutAdminCertRequest fail req.nominee address invalid', req)
    return { success: false, reason: 'Invalid nominee address' }
  }
  if (req.nominee != publicKey) {
    /* prettier-ignore */ nestedCountersInstance.countEvent('liberdus-admin-certificate', `validatePutAdminCertRequest fail req.nominee address and the current node public key do not match`)
    /* prettier-ignore */ if (LiberdusFlags.VerboseLogs) console.log('validatePutAdminCertRequest fail req.nominee address and the current node public key do not match', req)
    return { success: false, reason: 'nominee address and the current node public key do not match' }
  }
  try {
    if (!crypto.verifyObj(req, true)) return { success: false, reason: 'Invalid signature for AdminCert' }
  } catch (e) {
    return { success: false, reason: 'Invalid signature for QueryCert tx' }
  }
  try {
    const pkClearance = shardus.getDevPublicKey(req.sign.owner)

    if (pkClearance == null) {
      return { success: false, reason: 'Unauthorized! no getDevPublicKey defined' }
    }

    if (pkClearance && (!shardus.crypto.verify(req, pkClearance) || shardus.ensureKeySecurity(pkClearance, DevSecurityLevel.High) === false))
      return { success: false, reason: 'Unauthorized! Please use higher level auth key.' }
  } catch (e) {
    return { success: false, reason: 'Invalid signature for QueryCert tx' }
  }

  return { success: true, reason: '' }
}

export async function putAdminCertificateHandler(req: Request, shardus: Shardus): Promise<PutAdminCertResult> {
  nestedCountersInstance.countEvent('liberdus-admin-certificate', 'calling putAdminCertificateHandler')

  const certReq = req.body as PutAdminCertRequest
  const reqValidationResult = validatePutAdminCertRequest(certReq, shardus)
  if (!reqValidationResult.success) {
    nestedCountersInstance.countEvent('liberdus-admin-certificate', 'putAdminCertificateHandler: failed validateQueryCertRequest')
    return reqValidationResult
  }
  adminCert = certReq
  return { success: true }
}
