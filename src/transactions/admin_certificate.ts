import { Shardus, ShardusTypes, nestedCountersInstance } from '@shardus/core'
import config, { LiberdusFlags } from '../config'
import * as crypto from '../crypto'
import { Request } from 'express'
import { DevSecurityLevel } from '@shardus/core'
import { GoldenTicketRequest, NetworkAccount } from '../@types'
import { shardusPost } from '../utils/request'
import * as utils from '../utils'

export interface AdminCert {
  nominee: string
  certCreation: number
  certExp: number
  sign: ShardusTypes.Sign
  goldenTicket: boolean
}

export interface AdminCertResponse {
  success: boolean
  ticket?: AdminCert
  error?: string
  cached?: boolean
}

export type PutAdminCertRequest = AdminCert

export interface PutAdminCertResult {
  success: boolean
  reason?: string // error message if failed
}

export let adminCert: AdminCert = null
export let isRequestedAdminCert: boolean = false

function validatePutAdminCertRequest(req: PutAdminCertRequest, shardus: Shardus): PutAdminCertResult {
  const publicKey = shardus.crypto.getPublicKey()

  if (utils.isValidAddress(req.nominee) === false) {
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

export async function tryAndFetchGoldenTicket(publicKey: string, network: NetworkAccount, dapp: Shardus): Promise<AdminCert> {
  try {
    if (LiberdusFlags.VerboseLogs) console.log('Fetching golden ticket from', network.current.goldenTicketServerUrl, 'for publicKey', publicKey, 'node')
    const goldenTicketRequest: any = {
      publicKey,
      ip: config.server.ip.externalIp,
      port: config.server.ip.externalPort,
      timestamp: dapp.shardusGetTime(),
      nonce: Math.floor(Math.random() * 1e6),
    }
    const signedGoldenTicketRequest: GoldenTicketRequest = dapp.signAsNode(goldenTicketRequest)
    if (LiberdusFlags.VerboseLogs) console.log('Golden Ticket request', signedGoldenTicketRequest)
    const response = await shardusPost<AdminCertResponse>(network.current.goldenTicketServerUrl, signedGoldenTicketRequest, { timeout: 5000 })
    if (LiberdusFlags.VerboseLogs) console.log('Golden Ticket response', response.data)
    if (response.data && response.data.success) {
      return response.data.ticket
    } else {
      console.error('No golden ticket received')
      return null
    }
  } catch (error) {
    console.error(`Error fetching golden ticket from - ${(error as Error).message}`)
    return null
  }
}
export function setAdminCertificate(cert: AdminCert): void {
  adminCert = cert
}

export function markRequestedAdminCert(): void {
  isRequestedAdminCert = true
}
