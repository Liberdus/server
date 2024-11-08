import { nestedCountersInstance, Shardus, ShardusTypes } from '@shardus/core'
import * as crypto from '../../crypto'
import { Request } from 'express'
import { LiberdusFlags } from '../../config'
import { AccountAxiosResponse, AccountQueryResponse, InjectTxResponse, UserAccount, ValidatorError } from '../../@types'
import { fixBigIntLiteralsToBigInt, getRandom } from '../../utils'
import { shardusGetFromNode, shardusPostToNode, shardusPutToNode } from '../../utils/request'
import { logFlags } from '@shardus/core/dist/logger'

export let stakeCert: StakeCert = null

export const addStakeCert = (cert: StakeCert) => {
  stakeCert = cert
}

export const removeStakeCert = () => {
  stakeCert = null
}

// constants

const maxNodeAccountRetries = 3

const errNodeAccountNotFound = 'node account not found'
const errNodeBusy = 'node busy'

// types

export interface QueryCertRequest {
  nominee: string
  nominator: string
  sign: ShardusTypes.Sign
}

export type CertSignaturesResult = {
  success: boolean
  signedStakeCert?: StakeCert
}

export interface StakeCert {
  nominator: string //the operator account that nominated a node account
  nominee: string //the node account that was nominated
  stake: bigint //the amount staked
  certExp: number //cert expiration time in seconds
  signs?: ShardusTypes.Sign[] //this is used when when the cert has a list of valid signatures
  sign?: ShardusTypes.Sign //this is use when we need to sign and unsigned cert. signs and sign will not exist yet when sign() is called
}

export interface RemoveNodeCert {
  nodePublicKey: string //public key of the node account
  cycle: number //cert expiration time in seconds
  signs?: ShardusTypes.Sign[] //this is used when when the cert has a list of valid signatures
  sign?: ShardusTypes.Sign //this is use when we need to sign and unsigned cert. signs and sign will not exist yet when sign() is called
}

export const validate_fields = (tx: QueryCertRequest) => {
  const response = {
    success: false,
    reason: '',
  }
  if (!tx.nominator || tx.nominator === '' || tx.nominator.length !== 64) {
    response.reason = 'Invalid nominator address'
    nestedCountersInstance.countEvent('liberdus-staking', `validate_fields fail tx.nominator address invalid`)
    if (LiberdusFlags.VerboseLogs) console.log('validate_fields fail tx.nominator address invalid', tx)
    return response
  }
  if (!tx.nominee || tx.nominee === '' || tx.nominee.length !== 64) {
    response.reason = 'Invalid nominee address'
    nestedCountersInstance.countEvent('liberdus-staking', ` fail tx.nominee address invalid`)
    if (LiberdusFlags.VerboseLogs) console.log(' fail tx.nominee address invalid', tx)
    return response
  }
  if (!tx.sign || !tx.sign.owner || !tx.sign.sig || tx.sign.owner !== tx.nominee) {
    response.reason = 'not signed by nominee account'
    nestedCountersInstance.countEvent('liberdus-staking', `validate_fields fail not signed by nominee account`)
    if (LiberdusFlags.VerboseLogs) console.log('validate_fields fail not signed by nominee account', tx)
    return response
  }
  if (!crypto.verifyObj(tx)) {
    response.reason = 'Invalid signature for QueryCert tx'
    nestedCountersInstance.countEvent('liberdus-staking', `validate_fields fail Invalid signature for QueryCert tx`)
    if (LiberdusFlags.VerboseLogs) console.log('validate_fields fail Invalid signature for QueryCert tx', tx)
    return response
  }
  response.success = true
  response.reason = 'query certificate tx is valid'
  nestedCountersInstance.countEvent('liberdus-staking', `validate_fields query certificate tx is valid`)
  if (LiberdusFlags.VerboseLogs) console.log('validate_fields query certificate tx is valid', tx)
  return response
}

async function getAccount(randomConsensusNode: ShardusTypes.ValidatorNodeDetails, nodeAccountId: string): Promise<AccountQueryResponse | ValidatorError> {
  try {
    const queryString = `/account/:id`.replace(':id', nodeAccountId)
    console.log('queryString', queryString)
    const res = await shardusGetFromNode<AccountAxiosResponse>(randomConsensusNode, queryString)
    console.log('res', res)
    if (!res.data.account) {
      return { success: false, reason: errNodeAccountNotFound }
    }
    if (res.data.error == errNodeBusy) {
      return { success: false, reason: errNodeBusy }
    }
    const account = fixBigIntLiteralsToBigInt(res.data.account)
    return { success: true, account } as AccountQueryResponse
  } catch (error) {
    return { success: false, reason: (error as Error).message }
  }
}

export async function getAccountWithRetry(
  nodeAccountId: string,
  activeNodes: ShardusTypes.ValidatorNodeDetails[],
): Promise<AccountQueryResponse | ValidatorError> {
  let i = 0
  while (i <= maxNodeAccountRetries) {
    const randomConsensusNode = getRandom(activeNodes, 1)[0]
    const resp = await getAccount(randomConsensusNode, nodeAccountId)
    if (resp.success) return resp
    else {
      const err = resp as ValidatorError
      if (err.reason == errNodeAccountNotFound) return err
      else i++
    }
  }
  return { success: false, reason: errNodeBusy }
}

export async function getCertSignatures(shardus: Shardus, certData: StakeCert): Promise<CertSignaturesResult> {
  const signedAppData = await shardus.getAppDataSignatures('sign-stake-cert', crypto.hashObj(certData), 5, certData, 2)
  if (!signedAppData.success) {
    return {
      success: false,
      signedStakeCert: null,
    }
  }
  certData.signs = signedAppData.signatures
  return { success: true, signedStakeCert: certData }
}

/**
 * Query a random consensus node for the current node certificate by calling query-certificate
 * on the chosen node. The nominator is chosen by querying `account/:address` on the
 * randomly chosen consensus node
 *
 * @param shardus
 * @returns
 */
export async function queryCertificate(
  shardus: Shardus,
  publicKey: string,
  activeNodes: ShardusTypes.ValidatorNodeDetails[],
): Promise<CertSignaturesResult | ValidatorError> {
  nestedCountersInstance.countEvent('liberdus-staking', 'calling queryCertificate')

  if (activeNodes.length === 0) {
    return {
      success: false,
      reason: 'activeNodes list is 0 to get query certificate',
    }
  }

  const randomConsensusNode: ShardusTypes.ValidatorNodeDetails = getRandom(activeNodes, 1)[0]

  const callQueryCertificate = async (signedCertRequest: QueryCertRequest): Promise<CertSignaturesResult | ValidatorError> => {
    try {
      const res = await shardusPutToNode<CertSignaturesResult>(randomConsensusNode, '/query-certificate', signedCertRequest, {
        // Custom timeout because this request is expected to take a while
        timeout: 15000,
      })
      console.log('callQueryCertificate res', res)
      return res.data
    } catch (error) {
      return {
        success: false,
        reason: 'Failed to get query certificate',
      }
    }
  }

  const accountQueryResponse = (await getAccountWithRetry(publicKey, activeNodes)) as AccountQueryResponse
  if (!accountQueryResponse.success) return accountQueryResponse

  const nominator = accountQueryResponse.account?.nominator

  const certRequest = {
    nominee: publicKey,
    nominator: nominator,
  }
  const signedCertRequest: QueryCertRequest = shardus.signAsNode(certRequest)

  /* prettier-ignore */ if (logFlags.dapp_verbose) console.log('signedCertRequest', signedCertRequest)

  return await callQueryCertificate(signedCertRequest)
}

export async function queryCertificateHandler(req: Request, shardus: Shardus): Promise<CertSignaturesResult | ValidatorError> {
  nestedCountersInstance.countEvent('liberdus-staking', 'calling queryCertificateHandler')

  const queryCertReq = req.body as QueryCertRequest
  const reqValidationResult = validate_fields(queryCertReq)
  if (!reqValidationResult.success) {
    nestedCountersInstance.countEvent('liberdus-staking', 'queryCertificateHandler: failed validateQueryCertRequest')
    return reqValidationResult
  }

  const operatorAccount = await shardus.getLocalOrRemoteAccount(queryCertReq.nominator)
  if (!operatorAccount) {
    nestedCountersInstance.countEvent('liberdus-staking', 'queryCertificateHandler: failed to fetch operator account' + ' state')
    return { success: false, reason: 'Failed to fetch operator account state' }
  }
  const nodeAccount = await shardus.getLocalOrRemoteAccount(queryCertReq.nominee)
  if (!nodeAccount) {
    nestedCountersInstance.countEvent('liberdus-staking', 'queryCertificateHandler: failed to fetch node account state')
    return { success: false, reason: 'Failed to fetch node account state' }
  }

  const operatorAccountData = operatorAccount.data as UserAccount
  // [TODO]: check if this is operator account is a valid user account

  const currentTimestampInMillis = shardus.shardusGetTime()

  if (operatorAccountData.operatorAccountInfo == null) {
    nestedCountersInstance.countEvent('liberdus-staking', 'queryCertificateHandler: operator account info is null')
    return {
      success: false,
      reason: 'Operator account info is null',
    }
  }

  if (operatorAccountData.operatorAccountInfo.certExp === null) {
    nestedCountersInstance.countEvent('liberdus-staking', 'queryCertificateHandler: Operator certificate time is null')
    return {
      success: false,
      reason: 'Operator certificate time is null',
    }
  }

  // check operator cert validity
  if (operatorAccountData.operatorAccountInfo.certExp < currentTimestampInMillis) {
    nestedCountersInstance.countEvent('liberdus-staking', 'queryCertificateHandler: operator certificate has expired')

    return {
      success: false,
      reason: 'Operator certificate has expired',
    }
  }
  return await getCertSignatures(shardus, {
    nominator: queryCertReq.nominator,
    nominee: queryCertReq.nominee,
    stake: operatorAccountData.operatorAccountInfo.stake,
    certExp: operatorAccountData.operatorAccountInfo.certExp,
  })
}
