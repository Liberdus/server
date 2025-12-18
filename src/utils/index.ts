import {
  BaseLiberdusTx,
  DeveloperPayment,
  DevIssueAccount,
  InjectTxResponse,
  IssueAccount,
  NetworkAccount,
  TollUnit,
  Tx,
  TXTypes,
  UserAccount,
  ValidatorError,
  WrappedStates,
  GoldenTicketRequest,
  Accounts,
} from '../@types'
import { AdminCert } from '../transactions/admin_certificate'
import * as crypto from '../crypto'
import * as configs from '../config'
import { LiberdusFlags } from '../config'
import { Shardus, ShardusTypes } from '@shardus/core'
import { shardusPostToNode } from './request'
import { Utils } from '@shardus/lib-types'
import { ethers } from 'ethers'

const WEI = 10n ** 18n

export const maintenanceAmount = (timestamp: number, account: UserAccount, network: NetworkAccount): bigint => {
  let amount: bigint
  if (timestamp - account.lastMaintenance < network.current.maintenanceInterval) {
    amount = BigInt(0)
  } else {
    const maintenanceFee = 1 - Math.pow(1 - Number(network.current.maintenanceFee), (timestamp - account.lastMaintenance) / network.current.maintenanceInterval)
    amount = account.data.balance * BigInt(maintenanceFee)
    account.lastMaintenance = timestamp
  }
  if (typeof amount === 'bigint') return amount
  else return BigInt(0)
}

export function generateTxId(tx: any): string {
  let txId: string
  if (!tx.sign) {
    txId = crypto.hashObj(tx)
  } else {
    txId = crypto.hashObj(tx, true) // compute from tx
  }
  return txId
}

export function calculateAccountHash(account: Accounts): string {
  account.hash = '' // Not sure this is really necessary
  account.hash = crypto.hashObj(account)
  return account.hash
}

export function isMessageRecord(message: Tx.MessageRecord | Tx.Transfer | Tx.Read): message is Tx.MessageRecord {
  return message.type === TXTypes.message
}

export function verifyMultiSigs(
  rawPayload: object,
  signatures: ShardusTypes.Sign[],
  allowedPubkeys: { [pubkey: string]: ShardusTypes.DevSecurityLevel },
  minSigRequired: number,
  requiredSecurityLevel: ShardusTypes.DevSecurityLevel,
): boolean {
  if (!rawPayload || !signatures || !allowedPubkeys || !Array.isArray(signatures)) {
    return false
  }
  if (signatures.length < minSigRequired) return false
  if (signatures.length > Object.keys(allowedPubkeys).length) return false

  let validSigs = 0
  const seen = new Set()

  for (let i = 0; i < signatures.length; i++) {
    const signedObj = {
      ...rawPayload,
      sign: signatures[i],
    }
    /* eslint-disable security/detect-object-injection */
    // The sig owner has not been seen before
    // The sig owner is listed on the server
    // The sig owner has enough security clearance
    // The signature is valid
    if (
      !seen.has(signatures[i].owner) &&
      allowedPubkeys[signatures[i].owner] &&
      allowedPubkeys[signatures[i].owner] >= requiredSecurityLevel &&
      crypto.verifyObj(signedObj, true)
    ) {
      validSigs++
      seen.add(signatures[i].owner)
    }
    if (validSigs >= minSigRequired) break
  }
  return validSigs >= minSigRequired
}

type MajorityTargetValueFunc<T> = (o: T) => string
type MajorityResult<T> = T | null
type MajorityParam<T> = T[]

/**
 Gather the results into an array.
 Use an object to count the occurrences of each result.
 Iterate through the object to determine the majority result.
 Check if the majority count is greater than 1/2 of the total results
 @param results -  The original array
 @param getTargetValue - Function to get the target value for the object, default to identity function
 */
export function findMajorityResult<T>(results: MajorityParam<T>, getTargetValue: MajorityTargetValueFunc<T>): MajorityResult<T> {
  const resultCounts = {}

  // Count the occurrences of each result
  for (const result of results) {
    const value = getTargetValue(result)
    /* eslint-disable security/detect-object-injection */
    resultCounts[value] = (resultCounts[value] || 0) + 1
  }

  const totalResults = results.length

  // Find the majority result
  let majorityResult
  let majorityCount = 0

  for (const result of results) {
    const value = getTargetValue(result)
    /* eslint-disable security/detect-object-injection */
    const resultCount = resultCounts[value]
    if (resultCount > majorityCount) {
      majorityResult = result
      /* eslint-disable security/detect-object-injection */
      majorityCount = resultCount
    }
  }

  // Check if majority count is greater than 1/2 of total results
  if (majorityCount > totalResults / 2) {
    return majorityResult
  } else {
    return null
  }
}

/**
 * Try to print a variety of possible erros for debug purposes
 * @param err
 * @returns
 */
export function formatErrorMessage(err: unknown): string {
  let errMsg = 'An error occurred'

  if (typeof err === 'string') {
    errMsg = err
  } else if (err instanceof Error) {
    errMsg = err.message

    if (err.stack) {
      errMsg += ` \nStack trace:\n${err.stack}`
    }
  } else if (typeof err === 'object' && err !== null) {
    //chat gpt reccomended this fancy part but the linter doesn't like it

    // const keys = Object.keys(err)
    // if (keys.length > 0) {
    //   errMsg = 'Error properties:\n'
    //   const errObj = err as object
    //   for (const key of keys) {
    //     errMsg += `${key}: ${errObj[key]}\n`
    //   }
    // } else {
    errMsg = `Unknown error: ${Utils.safeStringify(err)}`
    // }
  } else {
    errMsg = `Unknown error: ${err}`
  }

  return errMsg
}

export function patchConfig(existingConfig: ShardusTypes.ShardusConfiguration, changeObj: any): void {
  //remove after testing
  /* prettier-ignore */
  if (LiberdusFlags.VerboseLogs) console.log(`TESTING existingObject: ${JSON.stringify(existingConfig, null, 2)}`)
  /* prettier-ignore */
  if (LiberdusFlags.VerboseLogs) console.log(`TESTING changeObj: ${JSON.stringify(changeObj, null, 2)}`)
  for (const changeKey in changeObj) {
    if (changeObj[changeKey] && existingConfig.server[changeKey]) {
      const targetObject = existingConfig.server[changeKey]
      const changeProperties = changeObj[changeKey]

      for (const propKey in changeProperties) {
        if (changeProperties[propKey] && targetObject[propKey]) {
          targetObject[propKey] = changeProperties[propKey]
        }
      }
    }
  }
}

export function comparePropertiesTypes(A: any, B: any): boolean {
  for (const key in A) {
    if (key in A) {
      if (!(key in B)) {
        // Property exists in A but not in B
        return false
      }

      // If both properties are objects (and not null), compare recursively
      if (typeof A[key] === 'object' && A[key] !== null && typeof B[key] === 'object' && B[key] !== null) {
        if (!comparePropertiesTypes(A[key], B[key])) {
          return false
        }
      } else {
        // For non-object properties, check if types are different
        if (typeof A[key] !== typeof B[key]) {
          return false
        }
      }
    }
  }
  return true
}

export function omitDevKeys(givenConfig: any): any {
  if (!givenConfig.debug?.devPublicKeys && !givenConfig.debug?.multisigKeys) {
    return givenConfig
  }

  const { debug, ...restOfConfig } = givenConfig
  const { devPublicKeys, multisigKeys, ...restOfDebug } = debug

  if (Object.keys(restOfDebug).length > 0) {
    return { ...restOfConfig, debug: restOfDebug }
  }

  return restOfConfig
}

export function isValidNetworkId(tx: BaseLiberdusTx, dapp: Shardus): boolean {
  if (tx.networkId == null) {
    return false
  }
  if (typeof tx.networkId !== 'string') {
    return false // networkId is not a string
  }
  const cycleRecords = dapp.getLatestCycles(1)
  if (cycleRecords.length === 0) {
    return false
  }
  return tx.networkId === cycleRecords[0].networkId // check if the networkId matches the expected one
}

export function isValidDevKeyAddition(givenConfig: any): boolean {
  const devPublicKeys = givenConfig.debug?.devPublicKeys
  if (!devPublicKeys) {
    return true
  }

  for (const key in devPublicKeys) {
    if (!isValidHexKey(key)) {
      return false
    }

    // eslint-disable-next-line security/detect-object-injection
    const securityLevel = devPublicKeys[key]
    if (!Object.values(ShardusTypes.DevSecurityLevel).includes(securityLevel)) {
      return false
    }
  }
  return true
}

export function isValidMultisigKeyAddition(givenConfig: any): boolean {
  const multisigKeys = givenConfig.debug?.multisigKeys
  if (!multisigKeys) {
    return true
  }

  for (const key in multisigKeys) {
    if (!isValidHexKey(key)) {
      return false
    }

    // eslint-disable-next-line security/detect-object-injection
    const securityLevel = multisigKeys[key]
    if (!Object.values(ShardusTypes.DevSecurityLevel).includes(securityLevel)) {
      return false
    }
  }
  return true
}

export function isValidHexKey(key: string): boolean {
  const hexPattern = /^[a-f0-9]{64}$/i
  return hexPattern.test(key)
}

export async function InjectTxToConsensor(
  randomConsensusNodes: ShardusTypes.ValidatorNodeDetails[],
  tx: ShardusTypes.OpaqueTransaction, // Sign Object
): Promise<InjectTxResponse | ValidatorError> {
  const stringifyTx = Utils.safeStringify(tx)
  const promises = []
  try {
    for (const randomConsensusNode of randomConsensusNodes) {
      const promise = shardusPostToNode<any>(randomConsensusNode, `/inject`, { tx: stringifyTx }) // eslint-disable-line
      // @typescript-eslint/no-explicit-any
      promises.push(promise)
    }
    const res = await raceForSuccess(promises, 5000)
    console.log('res', res)
    if (res.data.error) {
      return { success: false, reason: res.data.error }
    }
    return res.data.result as InjectTxResponse
  } catch (error) {
    return { success: false, reason: (error as Error).message }
  }
}

async function raceForSuccess<
  T extends {
    data: {
      result?: {
        success: boolean
        reason?: string
      }
      error?: string
    }
  },
>(promises: Promise<T>[], timeoutMs: number): Promise<T> {
  return new Promise((resolve, reject) => {
    let unresolvedCount = promises.length
    const timer = setTimeout(() => {
      reject(new Error('Timeout: Operation did not complete within the allowed time.'))
    }, timeoutMs)

    for (const promise of promises) {
      promise
        .then((response) => {
          if (response.data) {
            clearTimeout(timer)
            resolve(response)
          } else {
            unresolvedCount--
            if (unresolvedCount === 0) {
              clearTimeout(timer)
              //reject(new Error('All promises failed or returned unsuccessful responses.'))
              resolve(response)
            }
          }
        })
        .catch((error) => {
          unresolvedCount--
          if (unresolvedCount === 0) {
            clearTimeout(timer)
            //reject(new Error('All promises failed or returned unsuccessful responses: ' + error))
            reject(error)
          }
        })
    }
  })
}

// HELPER METHOD TO WAIT
export async function _sleep(ms = 0): Promise<NodeJS.Timeout> {
  // @ts-ignore
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// NODE_REWARD TRANSACTION FUNCTION
export function nodeReward(address: string, nodeId: string, dapp: Shardus): void {
  const tx = {
    type: 'node_reward',
    nodeId: nodeId,
    from: address,
    to: process.env.PAY_ADDRESS || address,
    timestamp: dapp.shardusGetTime(),
  }
  dapp.put(tx)
  dapp.log('GENERATED_NODE_REWARD: ', nodeId)
}

// START NETWORK DAO WINDOWS
export async function startNetworkWindows(address: string, nodeId: string, dapp: Shardus, set = false): Promise<void> {
  const account = await dapp.getLocalOrRemoteAccount(configs.networkAccount)
  const network = account.data as NetworkAccount
  const tx = {
    type: TXTypes.network_windows,
    nodeId,
    from: address,
    timestamp: dapp.shardusGetTime(),
  }
  const resp = await dapp.put(tx, set)
  dapp.log('start network windows tx', tx, resp)
}

// ISSUE TRANSACTION FUNCTION
export async function generateIssue(address: string, nodeId: string, dapp: Shardus, set = false): Promise<void> {
  const account = await dapp.getLocalOrRemoteAccount(configs.networkAccount)
  const network = account.data as NetworkAccount
  const tx = {
    type: TXTypes.issue,
    nodeId,
    from: address,
    issue: calculateIssueId(network.issue),
    proposal: crypto.hash(`issue-${network.issue}-proposal-1`),
    timestamp: dapp.shardusGetTime(),
  }
  dapp.put(tx, set)
  dapp.log('GENERATED_ISSUE: ', nodeId, tx)
}

// DEV_ISSUE TRANSACTION FUNCTION
export async function generateDevIssue(address: string, nodeId: string, dapp: Shardus, set = false): Promise<void> {
  const account = await dapp.getLocalOrRemoteAccount(configs.networkAccount)
  const network = account.data as NetworkAccount
  const tx = {
    type: TXTypes.dev_issue,
    nodeId,
    from: address,
    devIssue: calculateDevIssueId(network.devIssue),
    timestamp: dapp.shardusGetTime(),
  }
  dapp.put(tx, set)
  dapp.log('GENERATED_DEV_ISSUE: ', nodeId, tx)
}

// TALLY TRANSACTION FUNCTION
export async function tallyVotes(address: string, nodeId: string, dapp: Shardus, set = false): Promise<void> {
  console.log(`GOT TO TALLY_VOTES FN ${address} ${nodeId}`)
  try {
    const network = await dapp.getLocalOrRemoteAccount(configs.networkAccount)
    const networkAccount = network.data as NetworkAccount
    const account = await dapp.getLocalOrRemoteAccount(crypto.hash(`issue-${networkAccount.issue}`))
    if (!account) {
      dapp.log(`No account found for issue-${networkAccount.issue}`)
      await _sleep(500)
      return tallyVotes(address, nodeId, dapp)
    }
    const issue = account.data as IssueAccount
    const tx = {
      type: TXTypes.tally,
      nodeId,
      from: address,
      issue: issue.id,
      proposals: issue.proposals,
      timestamp: dapp.shardusGetTime(),
    }
    // todo: why is this not signed by the node?
    dapp.put(tx, set)
    dapp.log('GENERATED_TALLY: ', nodeId, tx)
  } catch (err) {
    dapp.log('ERR: ', err)
    await _sleep(1000)
    return tallyVotes(address, nodeId, dapp)
  }
}

// DEV_TALLY TRANSACTION FUNCTION
export async function tallyDevVotes(address: string, nodeId: string, dapp: Shardus, set = false): Promise<void> {
  try {
    const network = await dapp.getLocalOrRemoteAccount(configs.networkAccount)
    const networkAccount = network.data as NetworkAccount
    const account = await dapp.getLocalOrRemoteAccount(crypto.hash(`dev-issue-${networkAccount.devIssue}`))
    if (!account) {
      await _sleep(500)
      return tallyDevVotes(address, nodeId, dapp)
    }
    const devIssue = account.data as DevIssueAccount
    const tx = {
      type: TXTypes.dev_tally,
      nodeId,
      from: address,
      devIssue: devIssue.id,
      devProposals: devIssue.devProposals,
      timestamp: dapp.shardusGetTime(),
    }
    dapp.put(tx, set)
    dapp.log('GENERATED_DEV_TALLY: ', nodeId, tx)
  } catch (err) {
    dapp.log('ERR: ', err)
    await _sleep(1000)
    return tallyDevVotes(address, nodeId, dapp)
  }
}

// Inject "parameters" transaction to the network
export async function injectParameterTx(address: string, nodeId: string, dapp: Shardus, set = false): Promise<void> {
  const account = await dapp.getLocalOrRemoteAccount(configs.networkAccount)
  const network = account.data as NetworkAccount
  const tx = {
    type: TXTypes.parameters,
    nodeId,
    from: address,
    issue: crypto.hash(`issue-${network.issue}`),
    timestamp: dapp.shardusGetTime(),
  }
  const response = await dapp.put(tx)
  dapp.log('GENERATED_PARAMETER: ', nodeId, tx, response)
}

// Inject "dev_parameters" transaction to the network
export async function injectDevParameters(address: string, nodeId: string, dapp: Shardus, set = false): Promise<void> {
  const account = await dapp.getLocalOrRemoteAccount(configs.networkAccount)
  const network = account.data as NetworkAccount
  const tx = {
    type: TXTypes.dev_parameters,
    nodeId,
    from: address,
    devIssue: crypto.hash(`dev-issue-${network.devIssue}`),
    timestamp: dapp.shardusGetTime(),
  }
  dapp.put(tx, set)
  dapp.log('GENERATED_DEV_PARAMETER: ', nodeId, tx)
}

// APPLY_PARAMETERS TRANSACTION FUNCTION
export async function applyParameters(address: string, nodeId: string, dapp: Shardus, set = false): Promise<void> {
  const account = await dapp.getLocalOrRemoteAccount(configs.networkAccount)
  const network = account.data as NetworkAccount
  const tx = {
    type: TXTypes.apply_parameters,
    nodeId,
    from: address,
    issue: crypto.hash(`issue-${network.issue}`),
    timestamp: dapp.shardusGetTime(),
  }
  dapp.put(tx, set)
  dapp.log('GENERATED_APPLY: ', nodeId, tx)
}

// APPLY_DEV_PARAMETERS TRANSACTION FUNCTION
export async function applyDevParameters(address: string, nodeId: string, dapp: Shardus, set = false): Promise<void> {
  const account = await dapp.getLocalOrRemoteAccount(configs.networkAccount)
  const network = account.data as NetworkAccount
  const tx = {
    type: TXTypes.apply_dev_parameters,
    nodeId,
    from: address,
    devIssue: crypto.hash(`dev-issue-${network.devIssue}`),
    timestamp: dapp.shardusGetTime(),
  }
  dapp.put(tx)
  dapp.log('GENERATED_DEV_APPLY: ', nodeId, tx)
}

// RELEASE DEVELOPER FUNDS FOR A PAYMENT
export function releaseDeveloperFunds(payment: DeveloperPayment, address: string, nodeId: string, dapp: Shardus, set = false): void {
  const tx = {
    type: TXTypes.developer_payment,
    nodeId,
    from: address,
    developer: payment.address,
    payment: payment,
    timestamp: dapp.shardusGetTime(),
  }
  dapp.put(tx, set)
  dapp.log('GENERATED_DEV_PAYMENT: ', nodeId)
}

export function calculateIssueId(issueNumber: number): string {
  return crypto.hash(`issue-${issueNumber}`)
}

export function calculateDevIssueId(issueNumber: number): string {
  return crypto.hash(`dev-issue-${issueNumber}`)
}

export function getAccountType(data): string {
  if (data == null) {
    return 'undetermined'
  }

  if (data.type != null) {
    return data.type
  }

  //make sure this works on old accounts with no type
  if (data.alias !== undefined) {
    return 'UserAccount'
  }
  if (data.nodeRewardTime !== undefined) {
    return 'NodeAccount'
  }
  if (data.messages !== undefined) {
    return 'ChatAccount'
  }
  if (data.inbox !== undefined) {
    return 'AliasAccount'
  }
  if (data.devProposals !== undefined) {
    return 'DevIssueAccount'
  }
  if (data.proposals !== undefined) {
    return 'IssueAccount'
  }
  if (data.devWindows !== undefined) {
    return 'NetworkAccount'
  }
  if (data.totalVotes !== undefined) {
    if (data.power !== undefined) {
      return 'ProposalAccount'
    }
    if (data.payAddress !== undefined) {
      return 'DevProposalAccount'
    }
  }
  return 'undetermined'
}

export function calculateChatId(from: string, to: string): string {
  return crypto.hash([from, to].sort((a, b) => a.localeCompare(b)).join(''))
}

export function validateTxTimestamp(txnTimestamp: number): { success: boolean; reason: string } {
  const validationResult = { success: false, reason: '' }
  try {
    // Validate tx timestamp
    if (!txnTimestamp) {
      validationResult.reason = 'Invalid transaction timestamp'
      return validationResult
    }

    if (typeof txnTimestamp !== 'number' || !Number.isFinite(txnTimestamp) || txnTimestamp < 1) {
      validationResult.reason = 'Tx "timestamp" field must be a valid number.'
      return validationResult
    }
    return { success: true, reason: '' }
  } catch (e) {
    validationResult.reason = `Error: validateTxTimestamp: ${e}`
    return validationResult
  }
}

export function getInjectedOrGeneratedTimestamp(timestampedTx: any, dapp: Shardus): number {
  const { tx, timestampReceipt } = timestampedTx
  let txnTimestamp: number

  // In Liberdus, the network generated timestamp is not used.
  // The timestamp should be included in the user transaction.
  if (tx.timestamp) {
    txnTimestamp = tx.timestamp
    dapp.log(`Timestamp ${txnTimestamp} is extracted from the injected tx.`)
  } else if (LiberdusFlags.versionFlags.enforceTxTimestamp === false && timestampReceipt && timestampReceipt.timestamp) {
    txnTimestamp = timestampReceipt.timestamp
    dapp.log(`Timestamp ${txnTimestamp} is generated by the network nodes.`)
  }

  // if timestamp is a float, round it down to nearest millisecond
  return txnTimestamp && Math.floor(txnTimestamp)
}

export const isObject = (val): boolean => {
  if (val === null) {
    return false
  }
  if (Array.isArray(val)) {
    return false
  }
  return typeof val === 'function' || typeof val === 'object'
}

export const isValidAddress = (address: string): boolean => {
  // Address must be a string, fully lowercase and exactly 64 characters
  return typeof address === 'string' && address === address.toLowerCase() && address.length === 64
}

export const sortAddresses = (from: string, to: string): string[] => {
  return [from, to].sort((a, b) => a.localeCompare(b))
}

// From: https://stackoverflow.com/a/19270021
export function getRandom<T>(arr: T[], n: number): T[] {
  let len = arr.length
  const taken = new Array(len)
  if (n > len) {
    n = len
  }
  const result = new Array(n)
  /* eslint-disable security/detect-object-injection */
  while (n--) {
    const x = Math.floor(Math.random() * len)
    result[n] = arr[x in taken ? taken[x] : x]
    taken[x] = --len in taken ? taken[len] : len
  }
  /* eslint-enable security/detect-object-injection */
  return result
}

export function getNodeRewardRateWei(networkAccount: NetworkAccount): bigint {
  if (isEqualOrNewerVersion('2.4.2', networkAccount.current.activeVersion)) {
    return usdStrToWei(networkAccount.current.nodeRewardAmountUsdStr, networkAccount)
  } else {
    return networkAccount.current.nodeRewardAmountUsd
  }
}

export function getStakeRequiredWei(networkAccount: NetworkAccount): bigint {
  if (isEqualOrNewerVersion('2.4.2', networkAccount.current.activeVersion)) {
    return usdStrToWei(networkAccount.current.stakeRequiredUsdStr, networkAccount)
  } else {
    return networkAccount.current.stakeRequiredUsd
  }
}

export function getPenaltyWei(networkAccount: NetworkAccount): bigint {
  if (isEqualOrNewerVersion('2.4.2', networkAccount.current.activeVersion)) {
    return usdStrToWei(networkAccount.current.nodePenaltyUsdStr, networkAccount)
  } else {
    return networkAccount.current.nodePenaltyUsd
  }
}

export function getTransactionFeeWei(networkAccount: NetworkAccount): bigint {
  if (isEqualOrNewerVersion('2.4.2', networkAccount.current.activeVersion)) {
    return usdStrToWei(networkAccount.current.transactionFeeUsdStr, networkAccount)
  } else {
    return networkAccount.current.transactionFee
  }
}

export function getMinTollWei(networkAccount: NetworkAccount): bigint {
  if (isEqualOrNewerVersion('2.4.2', networkAccount.current.activeVersion)) {
    return usdStrToWei(networkAccount.current.minTollUsdStr, networkAccount)
  } else {
    return networkAccount.current.minToll
  }
}

export function getDefaultTollWei(networkAccount: NetworkAccount): bigint {
  if (isEqualOrNewerVersion('2.4.2', networkAccount.current.activeVersion)) {
    return usdStrToWei(networkAccount.current.defaultTollUsdStr, networkAccount)
  } else {
    return networkAccount.current.defaultToll
  }
}

export function usdStrToWei(usdStr: string, networkAccount: NetworkAccount): bigint {
  // Parse the stability factor as a decimal and convert to wei precision
  const stabilityFactor = ethers.parseEther(networkAccount.current.stabilityFactorStr)
  const usdBigInt = ethers.parseEther(usdStr)
  // Multiply by 10^18 first to maintain precision, then divide
  if (isEqualOrNewerVersion('2.4.3', networkAccount.current.activeVersion)) {
    return (usdBigInt * WEI) / stabilityFactor
  }
  return (usdBigInt * BigInt(10 ** 18)) / stabilityFactor
}

export function libToWei(lib: number): bigint {
  return BigInt(lib * 10 ** 18)
}

export function weiToLib(wei: bigint): string {
  if (!LiberdusFlags.versionFlags.weiToLibStringFormat) {
    return (Number(wei) / 10 ** 18).toString()
  }
  // Use ethers formatting for precise conversion to LIB string representation
  return ethers.formatEther(wei)
}

/*
The stabilityFactor = stabilityScaleMul / stabilityScaleDiv;
so only the Mul and Div parameters need to be changed when the price of LIB changes.
If 100 LIB = 1 USD then Mul = 100 and Div = 1. In this case the price of LIB is $0.01 and the SF = 100
 */
export function usdToWei(usd: bigint, networkAccount: NetworkAccount): bigint {
  if (isEqualOrNewerVersion('2.4.3', networkAccount.current.activeVersion)) {
    // Parse the stability factor as a decimal and convert to wei precision
    const stabilityFactor = ethers.parseEther(networkAccount.current.stabilityFactorStr)
    // Multiply by 10^18 first to maintain precision, then divide
    return (usd * WEI) / stabilityFactor
  } else {
    const scaleMul = BigInt(networkAccount.current.stabilityScaleMul)
    const scaleDiv = BigInt(networkAccount.current.stabilityScaleDiv)
    return (usd * scaleMul) / scaleDiv
  }
}

export function weiToUsd(lib: bigint, networkAccount: NetworkAccount): bigint {
  if (isEqualOrNewerVersion('2.4.3', networkAccount.current.activeVersion)) {
    // Parse the stability factor as a decimal and convert to wei precision
    const stabilityFactor = ethers.parseEther(networkAccount.current.stabilityFactorStr)
    // Multiply by stability factor first to maintain precision, then divide
    return (lib * stabilityFactor) / WEI
  } else {
    const scaleMul = BigInt(networkAccount.current.stabilityScaleMul)
    const scaleDiv = BigInt(networkAccount.current.stabilityScaleDiv)
    return (lib * scaleDiv) / scaleMul
  }
}

export function calculateRequiredTollInWei(account: UserAccount, network: NetworkAccount): bigint {
  let requiredTollInWei = account.data.toll || BigInt(0)
  if (account.data.tollUnit === TollUnit.usd) {
    requiredTollInWei = usdToWei(requiredTollInWei, network)
  }
  return requiredTollInWei
}

/**
 * Check if the test version is equal or newer than the min version
 * @param minimumVersion
 * @param testVersion
 * @returns
 */
export function isEqualOrNewerVersion(minimumVersion: string, testVersion: string): boolean {
  if (minimumVersion === testVersion) {
    return true
  }

  const minVerParts = minimumVersion.split('.')
  const testVerParts = testVersion.split('.')
  const maxLen = Math.max(minVerParts.length, testVerParts.length)

  /* eslint-disable security/detect-object-injection */
  for (let i = 0; i < maxLen; i++) {
    const testV = parseInt(testVerParts[i] || '0', 10)
    const minV = parseInt(minVerParts[i] || '0', 10)

    if (testV > minV) return true
    if (testV < minV) return false
  }
  /* eslint-enable security/detect-object-injection */

  // Versions are equal
  return true
}

/**
 * Check if the test version is equal or older than the max version
 * can also think of this as checking if testVersion is an earlier
 * version than maximumVersion
 * @param maximumVersion
 * @param testVersion
 * @returns
 */
export function isEqualOrOlderVersion(maximumVersion: string, testVersion: string): boolean {
  return isEqualOrNewerVersion(testVersion, maximumVersion)
}

export function isValidVersion(minimumVersion: string, latestVersion: string, testVersion: string): boolean {
  const equalOrNewer = isEqualOrNewerVersion(minimumVersion, testVersion)
  const equalOrOlder = isEqualOrOlderVersion(latestVersion, testVersion)
  return equalOrNewer && equalOrOlder
}

export function scaleByStabilityFactor(input: bigint, networkAccount: NetworkAccount): bigint {
  const stabilityScaleMult = BigInt(networkAccount.current.stabilityScaleMul)
  const stabilityScaleDiv = BigInt(networkAccount.current.stabilityScaleDiv)
  return (input * stabilityScaleMult) / stabilityScaleDiv
}

export const deepCopy = <T>(obj: T): T => {
  if (typeof obj !== 'object') {
    throw Error('Given element is not of type object.')
  }
  return Utils.safeJsonParse(Utils.safeStringify(obj))
}

// Helper method to create a deep copy of wrapped states
export const deepCloneWrappedStates = (wrappedStates: WrappedStates): WrappedStates => {
  const cloned = {}
  for (const accountId in wrappedStates) {
    cloned[accountId] = {
      ...wrappedStates[accountId],
      data: deepCopy(wrappedStates[accountId].data),
    }
  }
  return cloned
}

// Helper method to rollback wrapped states to original values
export const rollbackWrappedStates = (wrappedStates: WrappedStates, originalWrappedStates: WrappedStates): void => {
  for (const accountId in originalWrappedStates) {
    if (wrappedStates[accountId]) {
      wrappedStates[accountId].data = deepCopy(originalWrappedStates[accountId].data)
      wrappedStates[accountId].timestamp = originalWrappedStates[accountId].timestamp
      wrappedStates[accountId].stateId = originalWrappedStates[accountId].stateId
    }
  }
}
