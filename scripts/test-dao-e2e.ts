/**
 * DAO Phase 1 — End-to-End Feature Test Script
 *
 * Manages the full network lifecycle and walks through every DAO scenario.
 * Signs transactions using ethers ECDSA (matching useEthereumAddress: true).
 *
 * Usage:
 *   npm run test:dao:e2e
 *   npm run test:dao:e2e -- --no-start             (reuse a running network)
 *   npm run test:dao:e2e -- --verbose              (print full TX/response bodies)
 *   npm run test:dao:e2e -- --stop                 (tear down even when tests fail)
 *   npm run test:dao:e2e -- --scenario 1           (run only scenario 1)
 *   npm run test:dao:e2e -- --scenario 1,3,5       (run scenarios 1, 3 and 5)
 *   npm run test:dao:e2e -- --step 1.8             (run only step 1.8)
 *   npm run test:dao:e2e -- --step 1.8,1.9         (run steps 1.8 and 1.9)
 *
 * --step implies --no-start (assumes the network and account state are already set up).
 * Step IDs must match the leading token of the step name exactly, e.g. "1.8", "5.1".
 *
 * By default the network is left running when any step fails so you can iterate on
 * the test script without a full restart. Use --stop to force teardown. After server
 * code changes, restart the network (omit --no-start) so nodes pick up dist/.
 *
 * All timing values are read live from the network — nothing is hardcoded.
 * Each run writes:
 *   test-logs/dao-e2e-<timestamp>.log          — structured app log (console intercept)
 *   test-logs/dao-e2e-terminal-<timestamp>.log   — full terminal tee (compile, shardus, stdout/stderr)
 */

import axios from 'axios'
import execa from 'execa'
import { ethers } from 'ethers'
import fs from 'fs'
import path from 'path'
import * as ShardusCrypto from '@shardus/lib-crypto-utils'
import { Utils } from '@shardus/lib-types'
import { DaoProposalAccount } from '../src/@types'

// Set custom stringifier so hashObj handles bigints correctly.
// Mirrors what src/index.ts does at startup.
ShardusCrypto.init('69fa4195670576c0160d660c3be36556ff8d504725be8a59b5a96509e0c994bc')
ShardusCrypto.setCustomStringifier(Utils.safeStringify, 'shardus_safeStringify')

// ─── CLI Flags ───────────────────────────────────────────────────────────────

const cliArgs = process.argv.slice(2)
const VERBOSE = cliArgs.includes('--verbose')
const FORCE_STOP = cliArgs.includes('--stop')
const NO_STOP = cliArgs.includes('--no-stop') // legacy alias: always keep network up

/**
 * --scenario 1,3,5  — set of scenario numbers to run (default: all)
 * null means no filter (run all).
 */
const SCENARIO_FILTER: Set<number> | null = (() => {
  const idx = cliArgs.indexOf('--scenario')
  if (idx === -1) return null
  const val = cliArgs[idx + 1]
  if (!val || val.startsWith('--')) return null
  return new Set(val.split(',').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n)))
})()

/**
 * --step 1.8,1.9  — set of step IDs to run (default: all).
 * Step ID is the leading token of the step name, e.g. "1.8".
 * When set, only the matching steps execute; all others are skipped.
 * Automatically implies --no-start and derives SCENARIO_FILTER from the step numbers.
 */
const STEP_FILTER: Set<string> | null = (() => {
  const idx = cliArgs.indexOf('--step')
  if (idx === -1) return null
  const val = cliArgs[idx + 1]
  if (!val || val.startsWith('--')) return null
  return new Set(val.split(',').map(s => s.trim()).filter(Boolean))
})()

// --step implies --no-start (network + account state must already exist)
const NO_START = cliArgs.includes('--no-start') || STEP_FILTER !== null

const HOST = 'localhost:9001'
const ARCHIVER_HOST = 'localhost:4000'

/** Every test account is funded with this much LIB — well above any fee/threshold at any stability factor. */
const TEST_ACCOUNT_FUND_LIB = 100_000

// ─── Log file setup ───────────────────────────────────────────────────────────
// App log: test-logs/dao-e2e-<timestamp>.log
// Terminal log: test-logs/dao-e2e-terminal-<timestamp>.log (full stdout/stderr via run-dao-e2e.sh tee)

const logDir = path.resolve(__dirname, '../test-logs')
if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true })

function newLogStamp(): string {
  return new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').replace('Z', '')
}

const logStamp = process.env.DAO_E2E_LOG_STAMP ?? newLogStamp()
const logFile = path.join(logDir, `dao-e2e-${logStamp}.log`)
const terminalLogFile =
  process.env.DAO_E2E_TERMINAL_LOG ?? path.join(logDir, `dao-e2e-terminal-${logStamp}.log`)
const shellTeeActive = Boolean(process.env.DAO_E2E_TERMINAL_LOG)

const logStream = fs.createWriteStream(logFile, { flags: 'wx' })
let terminalStream: fs.WriteStream | null = null
let logClosed = false

/** When ts-node is invoked directly (no shell tee), mirror raw stdout/stderr to the terminal log. */
function setupDirectTerminalCapture(): void {
  if (shellTeeActive) return
  terminalStream = fs.createWriteStream(terminalLogFile, { flags: 'wx' })
  const writeRaw = (chunk: any, encoding?: BufferEncoding) => {
    if (logClosed || !terminalStream) return
    const text = typeof chunk === 'string' ? chunk : chunk.toString(encoding ?? 'utf8')
    terminalStream.write(text)
  }
  const origStdoutWrite = process.stdout.write.bind(process.stdout)
  const origStderrWrite = process.stderr.write.bind(process.stderr)
  process.stdout.write = ((chunk: any, encoding?: any, cb?: any) => {
    writeRaw(chunk)
    return origStdoutWrite(chunk, encoding, cb)
  }) as typeof process.stdout.write
  process.stderr.write = ((chunk: any, encoding?: any, cb?: any) => {
    writeRaw(chunk)
    return origStderrWrite(chunk, encoding, cb)
  }) as typeof process.stderr.write
}

function closeLog(): void {
  if (logClosed) return
  logClosed = true
  logStream.end()
  terminalStream?.end()
}

function writeLog(line: string): void {
  if (!logClosed) logStream.write(line + '\n')
}

setupDirectTerminalCapture()

// Intercept console.log so every line goes to both stdout and the app log file.
const _origLog = console.log.bind(console)
console.log = (...args: any[]) => {
  const line = args.map(a => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ')
  writeLog(line)
  _origLog(...args)
}
const _origError = console.error.bind(console)
console.error = (...args: any[]) => {
  const line = args.map(a => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ')
  writeLog('[ERROR] ' + line)
  _origError(...args)
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    writeLog(`[${signal}] Run interrupted`)
    closeLog()
    _origLog(`\nLogs saved:\n  App:      ${logFile}\n  Terminal: ${terminalLogFile}`)
    process.exit(130)
  })
}

writeLog('═'.repeat(64))
writeLog('DAO E2E test run')
writeLog(`Started: ${new Date().toISOString()}`)
writeLog(`App log: ${logFile}`)
writeLog(`Terminal log: ${terminalLogFile}`)
writeLog(`Args: ${cliArgs.length > 0 ? cliArgs.join(' ') : '(none)'}`)
writeLog('═'.repeat(64))
console.log(`App log:      ${logFile}`)
console.log(`Terminal log: ${terminalLogFile}`)

// ─── Types ───────────────────────────────────────────────────────────────────

type StepStatus = 'pass' | 'fail' | 'skip'

interface StepResult {
  name: string
  status: StepStatus
  ms: number
  error?: string
}

interface TestAccount {
  /** 64-char Shardus address derived from Ethereum address: ethAddr.slice(2).toLowerCase() + '0'.repeat(24) */
  address: string
  /** ethers v6: Wallet (from privateKey) or HDNodeWallet (from createRandom) — both have signMessage */
  wallet: { address: string; signMessage(message: string | Uint8Array): Promise<string> }
}

/** Live network timing — read from the network once it reaches 'processing' mode. */
interface NetworkTiming {
  /** Cycle duration in milliseconds (from cycleRecord.duration * 1000) */
  cycleDurationMs: number
  /** Network ID from the cycle record — must be included in every TX */
  networkId: string
  /** DAO phase durations in milliseconds (from network.current.dao.*) */
  reviewDurationMs: number
  votingDurationMs: number
  graceDurationMs: number
  claimDurationMs: number
  /** For computing minimum dao_vote spend (USD → LIB via stabilityFactor). */
  stabilityFactorStr: string
  minimumSpendUsdStr: string
}

// ─── Global state ─────────────────────────────────────────────────────────────

const results: StepResult[] = []

/**
 * Network ID from the cycle record — set once the network reaches 'processing'
 * mode and included in every TX to pass isValidNetworkId().
 */
let currentNetworkId = ''

/** Max wait for a queued TX to produce a receipt or for a proposal account to appear. */
let txSettleTimeoutMs = 45_000

// ─── Assertion ───────────────────────────────────────────────────────────────

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

// ─── Step / Scenario runner ───────────────────────────────────────────────────

async function step(name: string, fn: () => Promise<void>): Promise<void> {
  const start = Date.now()
  try {
    await fn()
    results.push({ name, status: 'pass', ms: Date.now() - start })
    console.log(`  ✅  ${name}`)
  } catch (err: any) {
    results.push({ name, status: 'fail', ms: Date.now() - start, error: err.message })
    console.log(`  ❌  ${name}: ${err.message}`)
    throw err
  }
}

/**
 * Derive the effective scenario filter, merging --scenario and --step flags.
 * If --step is set, the scenario filter is automatically narrowed to the
 * scenario numbers implied by the step IDs (e.g. "1.8" → scenario 1).
 */
function effectiveScenarioFilter(): Set<number> | null {
  if (STEP_FILTER) {
    // Derive scenario numbers from step IDs: "1.8" → 1, "5.1" → 5
    const nums = new Set<number>()
    for (const id of STEP_FILTER) {
      const n = parseInt(id.split('.')[0], 10)
      if (!isNaN(n)) nums.add(n)
    }
    return nums
  }
  return SCENARIO_FILTER
}

async function scenario(num: number, name: string, steps: Array<[string, () => Promise<void>]>): Promise<void> {
  const filter = effectiveScenarioFilter()
  if (filter && !filter.has(num)) {
    console.log(`\n── ${name} (skipped — not in filter) ──`)
    for (const [stepName] of steps) {
      results.push({ name: stepName, status: 'skip', ms: 0 })
      console.log(`  ⏭   ${stepName} (skipped)`)
    }
    return
  }

  console.log(`\n── ${name} ──`)
  let failed = false
  for (const [stepName, fn] of steps) {
    // Extract step ID from the step name: "1.8  Sleep past..." → "1.8"
    const stepId = stepName.trim().split(/\s+/)[0]
    const stepFiltered = STEP_FILTER && !STEP_FILTER.has(stepId)

    if (failed || stepFiltered) {
      results.push({ name: stepName, status: 'skip', ms: 0 })
      console.log(`  ⏭   ${stepName} (skipped${stepFiltered ? ' — not in --step filter' : ''})`)
      continue
    }
    try {
      await step(stepName, fn)
    } catch {
      failed = true
    }
  }
}

// ─── Utilities ───────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms))
}

/** Convert whole-LIB amount to wei (bigint). */
function libToWei(lib: number): bigint {
  return BigInt(lib) * 10n ** 18n
}

/** Convert a USD string to whole LIB (ceil), matching server usdStrToWei + stabilityFactor. */
function usdStrToLibCeil(usdStr: string, stabilityFactorStr: string): number {
  const stabilityWei = ethers.parseEther(stabilityFactorStr)
  const usdWei = ethers.parseEther(usdStr)
  const libWei = (usdWei * 10n ** 18n) / stabilityWei
  return Math.ceil(Number(ethers.formatEther(libWei)))
}

/** Parse a numeric string that may be decimal or hex (safeStringify bi values are often hex). */
function parseBiString(s: string): bigint {
  if (s.startsWith('0x')) return BigInt(s)
  if (/^[0-9]+$/.test(s)) return BigInt(s)
  if (/^[0-9a-fA-F]+$/.test(s)) return BigInt('0x' + s)
  return BigInt(s)
}

/** Normalise bigint fields from API (bigint, decimal/hex string, or safeStringify {dataType:'bi',value}). */
function asBigInt(value: bigint | string | number | { dataType?: string; value?: string }): bigint {
  if (typeof value === 'bigint') return value
  if (value != null && typeof value === 'object' && (value as any).dataType === 'bi' && (value as any).value != null) {
    return parseBiString(String((value as any).value))
  }
  if (typeof value === 'string') return parseBiString(value)
  return BigInt(value as number)
}

/**
 * Defensively parse a response body — axios may or may not auto-parse the
 * Content-Type returned by res.send(Utils.safeStringify(...)).
 */
function safeParse(data: unknown): any {
  return typeof data === 'string' ? Utils.safeJsonParse(data) : data
}

/** Shardus account address for proposal #n */
function daoProposalId(n: number): string {
  return ShardusCrypto.hash(`dao proposal #${n}`)
}

/**
 * Convert an Ethereum address to the 64-char Shardus format.
 * e.g. '0x29fADe...eBF' → '29fade...ebf000000000000000000000000'
 */
function toShardusAddress(ethAddress: string): string {
  const stripped = ethAddress.startsWith('0x') ? ethAddress.slice(2) : ethAddress
  if (stripped.length !== 40) throw new Error(`Invalid Ethereum address: ${ethAddress}`)
  return stripped.toLowerCase() + '0'.repeat(24)
}

/** Poll `check()` every `intervalMs` until it returns true or `timeoutMs` elapses */
async function pollUntil(check: () => Promise<boolean>, timeoutMs: number, intervalMs = 3_000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (await check()) return
    await sleep(intervalMs)
  }
  throw new Error(`pollUntil timed out after ${timeoutMs}ms`)
}

// ─── Accounts ────────────────────────────────────────────────────────────────

function makeAccount(): TestAccount {
  const wallet = ethers.Wallet.createRandom()
  return { address: toShardusAddress(wallet.address), wallet }
}

function makeAccountFromPrivateKey(privateKey: string): TestAccount {
  const wallet = new ethers.Wallet(privateKey)
  return { address: toShardusAddress(wallet.address), wallet }
}

// ─── Ethereum TX signing ──────────────────────────────────────────────────────

/**
 * Sign a TX object in-place using ethers ECDSA (matching useEthereumAddress: true).
 *
 * The server verifies with:
 *   message = ShardusCrypto.hashObj(txWithoutSign)
 *   recoveredEthAddr = ethers.verifyMessage(message, sig)
 *   recoveredShardusAddr = toShardusAddress(recoveredEthAddr)
 *   isValid = recoveredShardusAddr === tx.sign.owner
 *
 * We mirror this exactly: hash the TX without the sign field, then sign with
 * wallet.signMessage(hash) so ethers prefixes and hashes the same way.
 */
async function signTx<T extends object>(tx: T, account: TestAccount): Promise<T> {
  // Hash the TX without any sign field (mirrors server-side dataWithoutSign)
  const txWithoutSign: any = { ...tx }
  delete txWithoutSign.sign
  const message = ShardusCrypto.hashObj(txWithoutSign)

  // ethers v6 wallet.signMessage(string) treats the string as UTF-8 text,
  // adds the Ethereum signed message prefix, and signs — matching verifyMessage.
  const sig = await account.wallet.signMessage(message)

  ;(tx as any).sign = { owner: account.address, sig }
  return tx
}

// ─── HTTP helpers ─────────────────────────────────────────────────────────────

interface TxReceipt {
  success: boolean
  reason?: string
  txId: string
  type: string
}

/**
 * Poll GET /transaction/:txId until the app receipt is available.
 * Inject returns success when the TX is queued; apply success/failure is on the receipt.
 */
async function waitForTxReceipt(txId: string): Promise<TxReceipt> {
  let receipt: TxReceipt | null = null
  await pollUntil(
    async () => {
      try {
        const res = await axios.get(`http://${HOST}/transaction/${txId}`)
        const tx = res.data?.transaction
        if (tx && typeof tx.success === 'boolean') {
          receipt = tx as TxReceipt
          return true
        }
        return false
      } catch {
        return false
      }
    },
    txSettleTimeoutMs,
    2_000,
  )
  return receipt!
}

/**
 * Sign, inject, wait for receipt, and assert apply succeeded.
 * Posts { tx: Utils.safeStringify(tx) } — /inject reads req.body.tx via safeJsonParse.
 */
async function injectAndAssert<T extends object>(tx: T, account: TestAccount): Promise<any> {
  await signTx(tx, account)
  if (VERBOSE) console.log('  → TX:', Utils.safeStringify(tx))
  let res: any
  try {
    res = await axios.post(`http://${HOST}/inject`, { tx: Utils.safeStringify(tx) })
  } catch (err: any) {
    if (err.response) throw new Error(`HTTP ${err.response.status}: ${JSON.stringify(err.response.data)}`)
    throw err
  }
  if (VERBOSE) console.log('  ← Inject:', JSON.stringify(res.data))
  assert(res.data.result?.success === true, `TX rejected at inject: ${JSON.stringify(res.data)}`)
  const txId: string = res.data.result.txId
  assert(typeof txId === 'string' && txId.length > 0, `Inject succeeded but no txId returned`)

  const receipt = await waitForTxReceipt(txId)
  if (VERBOSE) console.log('  ← Receipt:', JSON.stringify(receipt))
  assert(receipt.success === true, `TX failed at apply: ${JSON.stringify(receipt)}`)
  return { ...res.data, receipt }
}

/**
 * Sign and inject a TX expected to be rejected.
 * Rejection may occur at inject (validate_fields) or at apply (validate) — check both.
 */
async function injectExpectReject<T extends object>(
  tx: T,
  account: TestAccount,
  reasonIncludes?: string,
): Promise<void> {
  await signTx(tx, account)
  if (VERBOSE) console.log('  → TX (expect reject):', Utils.safeStringify(tx))
  let result: any
  try {
    const res = await axios.post(`http://${HOST}/inject`, { tx: Utils.safeStringify(tx) })
    if (VERBOSE) console.log('  ← Inject:', JSON.stringify(res.data))
    result = res.data?.result
  } catch (err: any) {
    if (err.response) {
      if (VERBOSE) console.log('  ← Inject (HTTP error):', JSON.stringify(err.response.data))
      result = err.response.data?.result ?? err.response.data
    } else {
      throw err
    }
  }

  let reason: string
  if (result?.success === true && result.txId) {
    const receipt = await waitForTxReceipt(result.txId)
    if (VERBOSE) console.log('  ← Receipt:', JSON.stringify(receipt))
    assert(receipt.success !== true, `Expected TX to be rejected at apply but receipt succeeded`)
    reason = receipt.reason ?? ''
  } else {
    assert(result?.success !== true, `Expected TX to be rejected but inject succeeded without failure`)
    reason = result?.reason ?? ''
  }

  if (reasonIncludes) {
    assert(
      reason.toLowerCase().includes(reasonIncludes.toLowerCase()),
      `Expected rejection reason to include "${reasonIncludes}", got: "${reason}"`,
    )
  }
}

/**
 * Fetch proposal #n via /dao/proposals/:n — polls until the account exists post-apply.
 */
async function getProposal(n: number): Promise<DaoProposalAccount> {
  let proposal: DaoProposalAccount | null = null
  await pollUntil(
    async () => {
      try {
        const res = await axios.get(`http://${HOST}/dao/proposals/${n}`)
        const body = safeParse(res.data)
        if (body?.proposal != null) {
          proposal = body.proposal as DaoProposalAccount
          return true
        }
        return false
      } catch (err: any) {
        if (err.response?.status === 404) return false
        throw err
      }
    },
    txSettleTimeoutMs,
    2_000,
  )
  return proposal!
}

/**
 * Fetch the balance of a user account in wei.
 * Returns null if the account doesn't exist yet.
 */
async function getBalance(address: string): Promise<bigint | null> {
  try {
    const res = await axios.get(`http://${HOST}/account/${address}`)
    const data = safeParse(res.data)
    const account = data?.account ?? data?.data
    if (account?.data?.balance == null) return null
    return asBigInt(account.data.balance)
  } catch {
    return null
  }
}

/** Query current proposal count so we always use the right sequential number. */
async function nextProposalNumber(): Promise<number> {
  let res: any
  try {
    res = await axios.get(`http://${HOST}/dao/proposals/meta`)
  } catch (err: any) {
    if (err.response) {
      throw new Error(
        `GET /dao/proposals/meta HTTP ${err.response.status}: ${JSON.stringify(err.response.data)}`,
      )
    }
    throw err
  }
  const body = safeParse(res.data)
  return ((body?.meta?.count ?? 0) as number) + 1
}

/** Inject a 'create' TX to fund an account and wait for apply receipt. */
async function fundAccount(account: TestAccount, amountLib: number): Promise<void> {
  const tx: any = {
    type: 'create',
    networkId: currentNetworkId,
    from: account.address,
    amount: libToWei(amountLib),
    timestamp: Date.now(),
  }
  await signTx(tx, account)
  if (VERBOSE) console.log(`  → Fund TX (${amountLib} LIB):`, Utils.safeStringify(tx))
  let res: any
  try {
    res = await axios.post(`http://${HOST}/inject`, { tx: Utils.safeStringify(tx) })
  } catch (err: any) {
    if (err.response) throw new Error(`Fund TX HTTP ${err.response.status}: ${JSON.stringify(err.response.data)}`)
    throw err
  }
  assert(res.data.result?.success === true, `Fund TX failed: ${JSON.stringify(res.data)}`)
  const txId: string = res.data.result.txId
  const receipt = await waitForTxReceipt(txId)
  if (VERBOSE) console.log('  ← Fund receipt:', JSON.stringify(receipt))
  assert(receipt.success === true, `Fund TX failed at apply: ${JSON.stringify(receipt)}`)
}

// ─── Network management ───────────────────────────────────────────────────────

/**
 * Wait until the network reaches 'processing' mode, then return live timing values.
 * - Polls archiver GET /cycleinfo/1 until mode === 'processing'
 * - Reads cycleDuration and networkId from the cycle record
 * - Reads DAO phase durations from /network/parameters
 */
async function waitForNetwork(): Promise<NetworkTiming> {
  console.log('Waiting for network to reach processing mode (polling archiver cycleinfo)...')

  let cycleDurationMs = 0
  let networkId = ''
  await pollUntil(
    async () => {
      try {
        const res = await axios.get(`http://${ARCHIVER_HOST}/cycleinfo/1`)
        const cycleInfo: any[] = res.data?.cycleInfo ?? []
        if (cycleInfo.length === 0) return false
        const record = cycleInfo[0]
        if (record.mode === 'processing') {
          cycleDurationMs = record.duration * 1000
          networkId = record.networkId ?? ''
          console.log(`Network in processing mode. cycleDuration=${record.duration}s  networkId=${networkId}`)
          return true
        }
        if (VERBOSE) console.log(`  cycle mode: ${record.mode} (waiting for 'processing')`)
        return false
      } catch {
        return false
      }
    },
    10 * 60 * 1000,
    3_000,
  )

  console.log('Reading DAO parameters from network...')
  let daoParams: any = null
  let stabilityFactorStr = ''
  await pollUntil(
    async () => {
      try {
        const res = await axios.get(`http://${HOST}/network/parameters`)
        const current = res.data?.parameters?.current
        const dao = current?.dao
        if (dao?.reviewDuration && dao?.votingDuration && current?.stabilityFactorStr) {
          daoParams = dao
          stabilityFactorStr = current.stabilityFactorStr
          return true
        }
        return false
      } catch {
        return false
      }
    },
    30_000,
    3_000,
  )

  const timing: NetworkTiming = {
    cycleDurationMs,
    networkId,
    reviewDurationMs: daoParams.reviewDuration,
    votingDurationMs: daoParams.votingDuration,
    graceDurationMs: daoParams.graceDuration,
    claimDurationMs: daoParams.claimDuration,
    stabilityFactorStr,
    minimumSpendUsdStr: daoParams.minimumSpendUsdStr,
  }

  console.log(
    `Timing: cycle=${timing.cycleDurationMs / 1000}s  ` +
      `review=${timing.reviewDurationMs / 1000}s  ` +
      `voting=${timing.votingDurationMs / 1000}s  ` +
      `grace=${timing.graceDurationMs / 1000}s  ` +
      `claim=${timing.claimDurationMs / 1000}s`,
  )

  return timing
}

async function startNetwork(): Promise<void> {
  console.log('Starting 10-node network with DAO_TEST_MODE=1...')
  try {
    execa.commandSync('shardus clean-net', { stdio: [0, 1, 2] })
  } catch {
    /* nothing to clean */
  }
  try {
    execa.commandSync('rm -rf instances', { stdio: [0, 1, 2] })
  } catch {
    /* ok */
  }
  execa.commandSync('shardus create-net 10', {
    stdio: [0, 1, 2],
    env: { ...process.env, DAO_TEST_MODE: '1' },
  })
}

async function stopNetwork(): Promise<void> {
  console.log('\nStopping network...')
  execa.commandSync('shardus stop-net', { stdio: [0, 1, 2] })
  await sleep(3_000)
  execa.commandSync('shardus clean-net', { stdio: [0, 1, 2] })
  await sleep(2_000)
  execa.commandSync('rm -rf instances', { stdio: [0, 1, 2] })
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  // Load committee keypairs from dao-committee-keys.json
  // File format: [{ index, privateKey, ethAddress, shardusAddress }]
  const committeeKeysPath = path.resolve(__dirname, '../dao-committee-keys.json')
  if (!fs.existsSync(committeeKeysPath)) {
    throw new Error(`dao-committee-keys.json not found at ${committeeKeysPath}`)
  }
  const committeeKeysFile: Array<{ index: number; privateKey: string; shardusAddress: string }> = JSON.parse(
    fs.readFileSync(committeeKeysPath, 'utf8'),
  )
  const committee: TestAccount[] = committeeKeysFile.map(k => makeAccountFromPrivateKey(k.privateKey))

  // Fresh test participant accounts (funded during step 1.1)
  const proposer = makeAccount()
  const voter1 = makeAccount()
  const voter2 = makeAccount()

  let sc1ProposalN = 0
  let sc2ProposalN = 0
  let sc3ProposalN = 0
  let sc4ProposalN = 0
  let sc5ProposalN = 0

  if (!NO_START) await startNetwork()

  const timing = await waitForNetwork()
  const {
    cycleDurationMs,
    networkId,
    reviewDurationMs,
    votingDurationMs,
    graceDurationMs,
    stabilityFactorStr,
    minimumSpendUsdStr,
  } = timing
  currentNetworkId = networkId

  // Derived timing constants
  const applyParamsPollMs = cycleDurationMs * 5   // global message fires at cycle+3
  const SLEEP_BUFFER_MS = 5_000
  txSettleTimeoutMs = cycleDurationMs * 2 + SLEEP_BUFFER_MS

  const minVoteSpendLib = usdStrToLibCeil(minimumSpendUsdStr, stabilityFactorStr)
  console.log(`Funding: ${TEST_ACCOUNT_FUND_LIB} LIB per account; min dao_vote spend≈${minVoteSpendLib} LIB`)

  // ─────────────────────────────────────────────────────────────────────────
  // Scenario 1 — Happy path: governance proposal → accepted → applied → claimed
  // ─────────────────────────────────────────────────────────────────────────
  await scenario(1, 'Scenario 1 — Happy path (governance → accepted → applied → claimed)', [
    [
      '1.1  Fund all accounts',
      async () => {
        await Promise.all([
          fundAccount(proposer, TEST_ACCOUNT_FUND_LIB),
          fundAccount(voter1, TEST_ACCOUNT_FUND_LIB),
          fundAccount(voter2, TEST_ACCOUNT_FUND_LIB),
          ...committee.map(c => fundAccount(c, TEST_ACCOUNT_FUND_LIB)),
        ])
      },
    ],

    [
      '1.2  dao_proposal_create (governance: voteExponent 1.1 → 1.2)',
      async () => {
        sc1ProposalN = await nextProposalNumber()
        await injectAndAssert(
          {
            type: 'dao_proposal_create',
            networkId: currentNetworkId,
            from: proposer.address,
            proposalId: daoProposalId(sc1ProposalN),
            metaId: ShardusCrypto.hash('dao proposals meta'),
            proposalType: 'governance',
            emergency: false,
            description: 'Increase voteExponent from 1.1 to 1.2 to reward larger votes more',
            options: ['yes', 'no'],
            gracePeriod: graceDurationMs,
            governance: {
              changes: [{ key: 'voteExponent', value: '1.2', current: '1.1' }],
            },
            timestamp: Date.now(),
          },
          proposer,
        )
        const proposal = await getProposal(sc1ProposalN)
        assert(proposal.status === 'review', `Expected status 'review', got '${proposal.status}'`)
      },
    ],

    [
      '1.3  committee_vote accept #1 (status still review)',
      async () => {
        await injectAndAssert(
          {
            type: 'dao_committee_vote',
            networkId: currentNetworkId,
            from: committee[0].address,
            proposalId: daoProposalId(sc1ProposalN),
            vote: 'accept',
            timestamp: Date.now(),
          },
          committee[0],
        )
        const proposal = await getProposal(sc1ProposalN)
        assert(
          proposal.committeeVotesAccept.length === 1,
          `Expected 1 accept vote, got ${proposal.committeeVotesAccept.length}`,
        )
        assert(proposal.status === 'review', `Expected status still 'review', got '${proposal.status}'`)
      },
    ],

    [
      '1.4  committee_vote accept #2 (status still review)',
      async () => {
        await injectAndAssert(
          {
            type: 'dao_committee_vote',
            networkId: currentNetworkId,
            from: committee[1].address,
            proposalId: daoProposalId(sc1ProposalN),
            vote: 'accept',
            timestamp: Date.now(),
          },
          committee[1],
        )
        const proposal = await getProposal(sc1ProposalN)
        assert(
          proposal.committeeVotesAccept.length === 2,
          `Expected 2 accept votes, got ${proposal.committeeVotesAccept.length}`,
        )
        assert(proposal.status === 'review', `Expected status still 'review', got '${proposal.status}'`)
      },
    ],

    [
      '1.5  committee_vote accept #3 → decisive (3-of-5), status voting',
      async () => {
        await injectAndAssert(
          {
            type: 'dao_committee_vote',
            networkId: currentNetworkId,
            from: committee[2].address,
            proposalId: daoProposalId(sc1ProposalN),
            vote: 'accept',
            timestamp: Date.now(),
          },
          committee[2],
        )
        const proposal = await getProposal(sc1ProposalN)
        assert(proposal.status === 'voting', `Expected status 'voting', got '${proposal.status}'`)
      },
    ],

    [
      '1.6  dao_vote x2 (voter1 + voter2, both vote option 0)',
      async () => {
        await injectAndAssert(
          {
            type: 'dao_vote',
            networkId: currentNetworkId,
            from: voter1.address,
            proposalId: daoProposalId(sc1ProposalN),
            optionIndex: 0,
            spend: libToWei(minVoteSpendLib),
            timestamp: Date.now(),
          },
          voter1,
        )
        await injectAndAssert(
          {
            type: 'dao_vote',
            networkId: currentNetworkId,
            from: voter2.address,
            proposalId: daoProposalId(sc1ProposalN),
            optionIndex: 0,
            spend: libToWei(minVoteSpendLib),
            timestamp: Date.now(),
          },
          voter2,
        )
        const proposal = await getProposal(sc1ProposalN)
        assert(asBigInt(proposal.weights[0]) > 0n, 'Expected weights[0] > 0 after votes')
        assert(asBigInt(proposal.voterRewardPool) > 0n, 'Expected voterRewardPool > 0 after vote spend')
      },
    ],

    [
      '1.7  Sleep past votingEnd then dao_vote_result → accepted',
      async () => {
        const waitMs = votingDurationMs + SLEEP_BUFFER_MS
        console.log(`    Waiting ${waitMs / 1000}s for votingEnd (votingDuration=${votingDurationMs / 1000}s)...`)
        await sleep(waitMs)
        await injectAndAssert(
          {
            type: 'dao_vote_result',
            networkId: currentNetworkId,
            from: proposer.address,
            proposalId: daoProposalId(sc1ProposalN),
            timestamp: Date.now(),
          },
          proposer,
        )
        const proposal = await getProposal(sc1ProposalN)
        assert(proposal.status === 'accepted', `Expected status 'accepted', got '${proposal.status}'`)
        assert(asBigInt(proposal.rewardPoolAfterBurn) > 0n, 'Expected rewardPoolAfterBurn > 0 after burn')
        assert(proposal.claimEnd > 0, `Expected claimEnd > 0, got ${proposal.claimEnd}`)
      },
    ],

    [
      '1.8  Sleep past graceDuration, dao_apply_parameters → applied + network param updated',
      async () => {
        const waitMs = graceDurationMs + SLEEP_BUFFER_MS
        console.log(`    Waiting ${waitMs / 1000}s for grace period (graceDuration=${graceDurationMs / 1000}s)...`)
        await sleep(waitMs)
        await injectAndAssert(
          {
            type: 'dao_apply_parameters',
            networkId: currentNetworkId,
            from: proposer.address,
            proposalId: daoProposalId(sc1ProposalN),
            timestamp: Date.now(),
          },
          proposer,
        )
        const proposal = await getProposal(sc1ProposalN)
        assert(proposal.status === 'applied', `Expected status 'applied', got '${proposal.status}'`)

        // Global message fires at cycle+3 — poll up to 5 cycles for param to update
        console.log(
          `    Polling up to ${applyParamsPollMs / 1000}s for network.current.dao.voteExponent === 1.2` +
            ` (global msg at cycle+3 ≈ ${(cycleDurationMs * 3) / 1000}s)...`,
        )
        await pollUntil(async () => {
          try {
            const r = await axios.get(`http://${HOST}/network/parameters`)
            return r.data?.parameters?.current?.dao?.voteExponent === 1.2
          } catch {
            return false
          }
        }, applyParamsPollMs)

        const r = await axios.get(`http://${HOST}/network/parameters`)
        const listOfChanges: any[] = r.data?.parameters?.listOfChanges ?? []
        const hasChange = listOfChanges.some((c: any) => c?.appData?.dao?.voteExponent === 1.2)
        assert(
          hasChange,
          `Expected listOfChanges to contain appData.dao.voteExponent=1.2, got: ${JSON.stringify(listOfChanges)}`,
        )
      },
    ],

    [
      '1.9  Non-voter (proposer) tries dao_claim_reward on applied proposal → rejected',
      async () => {
        // Must run before claimDuration elapses (scenarios 2–4 take longer than claim window).
        await injectExpectReject(
          {
            type: 'dao_claim_reward',
            networkId: currentNetworkId,
            from: proposer.address,
            proposalId: daoProposalId(sc1ProposalN),
            timestamp: Date.now(),
          },
          proposer,
          'did not vote',
        )
      },
    ],

    [
      '1.10 dao_claim_reward (voter1 + voter2)',
      async () => {
        // Snapshot balances before claiming so we can verify they increased
        const voter1BalBefore = (await getBalance(voter1.address)) ?? 0n
        const voter2BalBefore = (await getBalance(voter2.address)) ?? 0n

        await injectAndAssert(
          {
            type: 'dao_claim_reward',
            networkId: currentNetworkId,
            from: voter1.address,
            proposalId: daoProposalId(sc1ProposalN),
            timestamp: Date.now(),
          },
          voter1,
        )
        await injectAndAssert(
          {
            type: 'dao_claim_reward',
            networkId: currentNetworkId,
            from: voter2.address,
            proposalId: daoProposalId(sc1ProposalN),
            timestamp: Date.now(),
          },
          voter2,
        )
        const proposal = await getProposal(sc1ProposalN)
        assert(proposal.claimList.length === 2, `Expected 2 claimants, got ${proposal.claimList.length}`)

        // Verify both voters actually received tokens — balance must have increased.
        // Each reward comes from rewardPoolAfterBurn; both voters have the same spend so
        // rewards should be nearly equal and non-zero.
        const voter1BalAfter = (await getBalance(voter1.address)) ?? 0n
        const voter2BalAfter = (await getBalance(voter2.address)) ?? 0n
        assert(voter1BalAfter > voter1BalBefore, `voter1 balance did not increase after claim (before=${voter1BalBefore} after=${voter1BalAfter})`)
        assert(voter2BalAfter > voter2BalBefore, `voter2 balance did not increase after claim (before=${voter2BalBefore} after=${voter2BalAfter})`)

        // Both voters had the same spend amount — their rewards should be within 1% of each other
        const voter1Reward = voter1BalAfter - voter1BalBefore
        const voter2Reward = voter2BalAfter - voter2BalBefore
        const pctDiff = voter1Reward > voter2Reward
          ? Number((voter1Reward - voter2Reward) * 10000n / voter1Reward) / 100
          : Number((voter2Reward - voter1Reward) * 10000n / voter2Reward) / 100
        assert(pctDiff < 5, `Voter rewards differ by ${pctDiff.toFixed(2)}% (expected <5% for same-sized votes): voter1=${voter1Reward} voter2=${voter2Reward}`)
        console.log(`    Rewards: voter1 +${ethers.formatEther(voter1Reward)} LIB, voter2 +${ethers.formatEther(voter2Reward)} LIB (${pctDiff.toFixed(3)}% diff)`)
      },
    ],

    [
      '1.11 Double-claim rejected (voter1 claims again)',
      async () => {
        await injectExpectReject(
          {
            type: 'dao_claim_reward',
            networkId: currentNetworkId,
            from: voter1.address,
            proposalId: daoProposalId(sc1ProposalN),
            timestamp: Date.now(),
          },
          voter1,
          'already claimed',
        )
      },
    ],
  ])

  // ─────────────────────────────────────────────────────────────────────────
  // Scenario 2 — Withheld path
  // ─────────────────────────────────────────────────────────────────────────
  await scenario(2, 'Scenario 2 — Withheld path', [
    [
      '2.1  dao_proposal_create (new governance proposal)',
      async () => {
        sc2ProposalN = await nextProposalNumber()
        await injectAndAssert(
          {
            type: 'dao_proposal_create',
            networkId: currentNetworkId,
            from: proposer.address,
            proposalId: daoProposalId(sc2ProposalN),
            metaId: ShardusCrypto.hash('dao proposals meta'),
            proposalType: 'governance',
            emergency: false,
            description: 'Withheld test — increase pctBurned to 60',
            options: ['yes', 'no'],
            gracePeriod: graceDurationMs,
            governance: {
              changes: [{ key: 'pctBurned', value: '60', current: '50' }],
            },
            timestamp: Date.now(),
          },
          proposer,
        )
        const proposal = await getProposal(sc2ProposalN)
        assert(proposal.status === 'review', `Expected status 'review', got '${proposal.status}'`)
      },
    ],

    [
      '2.2  committee_vote withhold x3 → decisive withhold, status withheld',
      async () => {
        for (let i = 0; i < 3; i++) {
          await injectAndAssert(
            {
              type: 'dao_committee_vote',
              networkId: currentNetworkId,
              from: committee[i].address,
              proposalId: daoProposalId(sc2ProposalN),
              vote: 'withhold',
              reason: 'Test withhold',
              timestamp: Date.now(),
            },
            committee[i],
          )
        }
        const proposal = await getProposal(sc2ProposalN)
        assert(proposal.status === 'withheld', `Expected status 'withheld', got '${proposal.status}'`)
      },
    ],

    [
      '2.3  voterRewardPool === 0 (proposalFee burned on withhold)',
      async () => {
        const proposal = await getProposal(sc2ProposalN)
        assert(
          asBigInt(proposal.voterRewardPool) === 0n,
          `Expected voterRewardPool = 0n, got ${proposal.voterRewardPool}`,
        )
      },
    ],
  ])

  // ─────────────────────────────────────────────────────────────────────────
  // Scenario 3 — Auto-accept via dao_committee_result
  // ─────────────────────────────────────────────────────────────────────────
  await scenario(3, 'Scenario 3 — Auto-accept via committee_result (no committee votes submitted)', [
    [
      '3.1  dao_proposal_create (non-emergency, no votes will be submitted)',
      async () => {
        sc3ProposalN = await nextProposalNumber()
        await injectAndAssert(
          {
            type: 'dao_proposal_create',
            networkId: currentNetworkId,
            from: proposer.address,
            proposalId: daoProposalId(sc3ProposalN),
            metaId: ShardusCrypto.hash('dao proposals meta'),
            proposalType: 'governance',
            emergency: false,
            description: 'Auto-accept test — committee_result will advance this after reviewEnd',
            options: ['yes', 'no'],
            gracePeriod: graceDurationMs,
            governance: {
              changes: [{ key: 'pctBurned', value: '55', current: '50' }],
            },
            timestamp: Date.now(),
          },
          proposer,
        )
        const proposal = await getProposal(sc3ProposalN)
        assert(proposal.status === 'review', `Expected status 'review', got '${proposal.status}'`)
      },
    ],

    [
      '3.2  Sleep past reviewEnd',
      async () => {
        const waitMs = reviewDurationMs + SLEEP_BUFFER_MS
        console.log(`    Waiting ${waitMs / 1000}s for reviewEnd (reviewDuration=${reviewDurationMs / 1000}s)...`)
        await sleep(waitMs)
      },
    ],

    [
      '3.3  dao_committee_result → status voting (non-emergency auto-advances)',
      async () => {
        await injectAndAssert(
          {
            type: 'dao_committee_result',
            networkId: currentNetworkId,
            from: proposer.address,
            proposalId: daoProposalId(sc3ProposalN),
            timestamp: Date.now(),
          },
          proposer,
        )
        const proposal = await getProposal(sc3ProposalN)
        assert(proposal.status === 'voting', `Expected status 'voting', got '${proposal.status}'`)
      },
    ],
  ])

  // ─────────────────────────────────────────────────────────────────────────
  // Scenario 4 — Emergency proposal path
  // ─────────────────────────────────────────────────────────────────────────
  await scenario(4, 'Scenario 4 — Emergency proposal path', [
    [
      '4.1  Non-committee address submits emergency proposal → rejected',
      async () => {
        const fakeN = await nextProposalNumber()
        await injectExpectReject(
          {
            type: 'dao_proposal_create',
            networkId: currentNetworkId,
            from: voter1.address,
            proposalId: daoProposalId(fakeN),
            metaId: ShardusCrypto.hash('dao proposals meta'),
            proposalType: 'governance',
            emergency: true,
            description: 'Emergency proposal from non-committee — must be rejected',
            options: ['yes', 'no'],
            gracePeriod: graceDurationMs,
            governance: {
              changes: [{ key: 'pctBurned', value: '70', current: '50' }],
            },
            timestamp: Date.now(),
          },
          voter1,
          'committee',
        )
      },
    ],

    [
      '4.2  committee[0] creates emergency proposal (status review)',
      async () => {
        sc4ProposalN = await nextProposalNumber()
        await injectAndAssert(
          {
            type: 'dao_proposal_create',
            networkId: currentNetworkId,
            from: committee[0].address,
            proposalId: daoProposalId(sc4ProposalN),
            metaId: ShardusCrypto.hash('dao proposals meta'),
            proposalType: 'governance',
            emergency: true,
            description: 'Emergency governance proposal by committee member',
            options: ['yes', 'no'],
            gracePeriod: graceDurationMs,
            governance: {
              changes: [{ key: 'pctBurned', value: '70', current: '50' }],
            },
            timestamp: Date.now(),
          },
          committee[0],
        )
        const proposal = await getProposal(sc4ProposalN)
        assert(proposal.status === 'review', `Expected status 'review', got '${proposal.status}'`)
        assert(proposal.emergency === true, 'Expected emergency === true')
      },
    ],

    [
      '4.3  committee_vote accept x3 → accepted (emergency skips community voting)',
      async () => {
        for (let i = 0; i < 3; i++) {
          await injectAndAssert(
            {
              type: 'dao_committee_vote',
              networkId: currentNetworkId,
              from: committee[i].address,
              proposalId: daoProposalId(sc4ProposalN),
              vote: 'accept',
              timestamp: Date.now(),
            },
            committee[i],
          )
        }
        const proposal = await getProposal(sc4ProposalN)
        assert(
          proposal.status === 'accepted',
          `Expected status 'accepted' for emergency, got '${proposal.status}'`,
        )
      },
    ],

    [
      '4.4  voterRewardPool === 0 (no community voting for emergency)',
      async () => {
        const proposal = await getProposal(sc4ProposalN)
        assert(
          asBigInt(proposal.voterRewardPool) === 0n,
          `Expected voterRewardPool = 0n for emergency, got ${proposal.voterRewardPool}`,
        )
      },
    ],

    [
      '4.5  votingEnd > 0 (set to acceptance txTimestamp, used as grace period base)',
      async () => {
        const proposal = await getProposal(sc4ProposalN)
        assert(proposal.votingEnd > 0, `Expected votingEnd > 0, got ${proposal.votingEnd}`)
      },
    ],
  ])

  // ─────────────────────────────────────────────────────────────────────────
  // Scenario 5 — Access control & rejection cases
  // ─────────────────────────────────────────────────────────────────────────
  await scenario(5, 'Scenario 5 — Access control & rejection cases', [
    [
      '5.1  Non-committee address submits committee_vote on fresh review proposal → rejected',
      async () => {
        sc5ProposalN = await nextProposalNumber()
        await injectAndAssert(
          {
            type: 'dao_proposal_create',
            networkId: currentNetworkId,
            from: proposer.address,
            proposalId: daoProposalId(sc5ProposalN),
            metaId: ShardusCrypto.hash('dao proposals meta'),
            proposalType: 'governance',
            emergency: false,
            description: 'Access control test proposal — stays in review',
            options: ['yes', 'no'],
            gracePeriod: graceDurationMs,
            governance: {
              changes: [{ key: 'pctBurned', value: '45', current: '50' }],
            },
            timestamp: Date.now(),
          },
          proposer,
        )
        // voter1 is not a committee member — should be rejected with 'committee'
        await injectExpectReject(
          {
            type: 'dao_committee_vote',
            networkId: currentNetworkId,
            from: voter1.address,
            proposalId: daoProposalId(sc5ProposalN),
            vote: 'accept',
            timestamp: Date.now(),
          },
          voter1,
          'committee',
        )
      },
    ],

    [
      '5.2  dao_vote on review-status proposal → rejected (not in voting phase)',
      async () => {
        await injectExpectReject(
          {
            type: 'dao_vote',
            networkId: currentNetworkId,
            from: voter1.address,
            proposalId: daoProposalId(sc5ProposalN),
            optionIndex: 0,
            spend: libToWei(minVoteSpendLib),
            timestamp: Date.now(),
          },
          voter1,
          'voting',
        )
      },
    ],

    [
      '5.3  dao_vote_result on review proposal (sc5) → rejected',
      async () => {
        await injectExpectReject(
          {
            type: 'dao_vote_result',
            networkId: currentNetworkId,
            from: proposer.address,
            proposalId: daoProposalId(sc5ProposalN),
            timestamp: Date.now(),
          },
          proposer,
          'voting',
        )
      },
    ],
  ])

  // ─────────────────────────────────────────────────────────────────────────
  // Final summary
  // ─────────────────────────────────────────────────────────────────────────
  const totalMs = results.reduce((sum, r) => sum + r.ms, 0)
  const passed = results.filter(r => r.status === 'pass').length
  const failed = results.filter(r => r.status === 'fail').length
  const skipped = results.filter(r => r.status === 'skip').length

  console.log('\n' + '═'.repeat(64))
  console.log('  DAO E2E Test Results')
  console.log('═'.repeat(64))
  for (const r of results) {
    const icon = r.status === 'pass' ? '✅' : r.status === 'fail' ? '❌' : '⏭ '
    const timeStr = r.status !== 'skip' ? `${(r.ms / 1000).toFixed(1)}s` : '-'
    const errStr = r.error ? `  [${r.error}]` : ''
    console.log(`  ${icon}  ${r.name.padEnd(50)} ${timeStr.padStart(7)}${errStr}`)
  }
  console.log('═'.repeat(64))
  const totalSec = (totalMs / 1000).toFixed(0)
  console.log(
    `  Passed: ${passed} / ${results.length}   Failed: ${failed}   Skipped: ${skipped}   Total: ~${totalSec}s`,
  )
  console.log('═'.repeat(64))
  console.log(`Logs saved:\n  App:      ${logFile}\n  Terminal: ${terminalLogFile}`)

  writeLog(`Finished: ${new Date().toISOString()}`)
  writeLog(`Terminal log: ${terminalLogFile}`)
  closeLog()

  const shouldStop = FORCE_STOP || (failed === 0 && !NO_STOP)
  if (shouldStop) {
    await stopNetwork()
  } else if (failed > 0) {
    console.log('\nNetwork left running (tests failed). Re-run with:')
    console.log('  npm run test:dao:e2e -- --no-start [--verbose]')
    console.log('After server code changes, omit --no-start so nodes reload dist/.')
    console.log('Use --stop to tear down the network.')
  }

  process.exit(failed > 0 ? 1 : 0)
}

main().catch(err => {
  console.error('Fatal error:', err)
  writeLog(`Fatal error: ${err?.message ?? err}`)
  closeLog()
  _origLog(`Logs saved:\n  App:      ${logFile}\n  Terminal: ${terminalLogFile}`)
  process.exit(1)
})
