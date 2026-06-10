/**
 * DAO Phase 1 — End-to-End Feature Test Script
 *
 * Manages the full network lifecycle and walks through every DAO scenario.
 * Signs transactions using ethers ECDSA (matching useEthereumAddress: true).
 *
 * Usage:
 *   npm run test:dao:e2e
 *   npm run test:dao:e2e -- --no-start             (reuse a running network)
 *   npm run test:dao:e2e -- --no-stop              (keep network alive after all tests pass)
 *   npm run test:dao:e2e -- --verbose              (print full TX/response bodies)
 *   npm run test:dao:e2e -- --stop                 (tear down even when tests fail)
 *   npm run test:dao:e2e -- --parallel             (proposal creation sequential, then scenario bodies concurrent)
 *   npm run test:dao:e2e -- --scenario 1           (run only scenario 1)
 *   npm run test:dao:e2e -- --scenario 1,3,5       (run scenarios 1, 3 and 5)
 *   npm run test:dao:e2e -- --step 1.8             (run only step 1.8)
 *   npm run test:dao:e2e -- --step 1.8,1.9         (run steps 1.8 and 1.9)
 *
 * --step implies --no-start (assumes the network is already running).
 * Account keys and proposal numbers are restored from test-logs/dao-e2e-run-state.json,
 * which is written automatically on every fresh run and updated after each proposal creation.
 * Step IDs must match the leading token of the step name exactly, e.g. "1.8", "5.1".
 *
 * --parallel splits each scenario into a setup phase (proposal creation, run sequentially
 * to avoid meta.count races) and a body phase (all remaining steps run concurrently).
 * Output lines are prefixed with [S1]…[S5] to distinguish interleaved scenarios.
 * Note: --step is not designed to combine with --parallel.
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

// ─── Timestamp-prefix all console output ─────────────────────────────────────
// Patch console.log/warn/error once so every line carries a wall-clock prefix
// (HH:MM:SS.mmm) without needing to touch each call site.
;((['log', 'warn', 'error'] as const)).forEach((method) => {
  const orig = console[method].bind(console)
  console[method] = (...args: unknown[]) => {
    const d = new Date()
    const ts = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}.${String(d.getMilliseconds()).padStart(3, '0')}`
    orig(`[${ts}]`, ...args)
  }
})

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

/**
 * --parallel  Run all scenario setups (proposal creation) sequentially to avoid
 * meta.count races, then run all scenario bodies concurrently via Promise.allSettled.
 * Each body step is prefixed with [Sn] in console output.
 */
const PARALLEL = cliArgs.includes('--parallel')

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

// ─── Run-state persistence ────────────────────────────────────────────────────
// Written after every proposal-creation setup step so that `--step X.Y` retries
// can restore the exact account keys and proposal numbers from the previous run,
// rather than defaulting to 0 and targeting the wrong proposal.
//
// The file lives in test-logs/ (gitignored) because it contains private keys.

const RUN_STATE_PATH = path.join(logDir, 'dao-e2e-run-state.json')

interface RunState {
  networkId: string
  proposerKeys?: string[]
  voterKeys?: string[]
  proposalNumbers?: Record<string, number>
  // Legacy fields kept so --no-start can still resume an older run-state file.
  proposerKey?: string
  voter1Key?: string
  voter2Key?: string
  sc1ProposalN?: number
  sc2ProposalN?: number
  sc3ProposalN?: number
  sc4ProposalN?: number
  sc5ProposalN?: number
}

function saveRunState(state: RunState): void {
  try {
    fs.writeFileSync(RUN_STATE_PATH, JSON.stringify(state, null, 2))
  } catch (err) {
    console.warn(`Warning: failed to save run state to ${RUN_STATE_PATH}: ${err}`)
  }
}

function loadRunState(): RunState | null {
  try {
    const raw = fs.readFileSync(RUN_STATE_PATH, 'utf-8')
    return JSON.parse(raw) as RunState
  } catch {
    return null
  }
}

// ─── Types ───────────────────────────────────────────────────────────────────

type StepStatus = 'pass' | 'fail' | 'skip'

interface StepResult {
  name: string
  status: StepStatus
  ms: number
  error?: string
}

interface StepSortKey {
  scenario: number
  step: number
  suffix: string
}

/**
 * Describes a single test scenario split into two phases:
 *  - setupSteps: must run sequentially (e.g. proposal creation that increments meta.count)
 *  - bodySteps:  can run in parallel with other scenarios once all setups are done
 *
 * In sequential mode both arrays are concatenated and run in order.
 * In --parallel mode all setupSteps across all scenarios run first (sequentially),
 * then all bodySteps run concurrently.
 */
interface ScenarioDef {
  num: number
  name: string
  setupSteps: Array<[string, () => Promise<void>]>
  bodySteps: Array<[string, () => Promise<void>]>
  /** Timing- or account-contention-sensitive scenarios stay sequential even when --parallel is used. */
  sequentialOnly?: boolean
}

interface TestAccount {
  /** 64-char Shardus address derived from Ethereum address: ethAddr.slice(2).toLowerCase() + '0'.repeat(24) */
  address: string
  /** ethers v6: Wallet (from privateKey) or HDNodeWallet (from createRandom) — both have signMessage */
  wallet: { address: string; privateKey: string; signMessage(message: string | Uint8Array): Promise<string> }
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

function stepSortKey(name: string): StepSortKey {
  const stepId = name.trim().split(/\s+/)[0] ?? ''
  const match = stepId.match(/^(\d+)\.(\d+)([a-z]*)$/i)
  if (!match) return { scenario: Number.MAX_SAFE_INTEGER, step: Number.MAX_SAFE_INTEGER, suffix: stepId }
  return {
    scenario: Number(match[1]),
    step: Number(match[2]),
    suffix: match[3].toLowerCase(),
  }
}

function compareStepResults(a: StepResult, b: StepResult): number {
  const aKey = stepSortKey(a.name)
  const bKey = stepSortKey(b.name)
  return (
    aKey.scenario - bKey.scenario ||
    aKey.step - bKey.step ||
    aKey.suffix.localeCompare(bKey.suffix) ||
    a.name.localeCompare(b.name)
  )
}

// ─── Step / Scenario runner ───────────────────────────────────────────────────

async function step(name: string, fn: () => Promise<void>, prefix = ''): Promise<void> {
  const start = Date.now()
  try {
    await fn()
    results.push({ name, status: 'pass', ms: Date.now() - start })
    console.log(`${prefix}  ✅  ${name}`)
  } catch (err: any) {
    results.push({ name, status: 'fail', ms: Date.now() - start, error: err.message })
    console.log(`${prefix}  ❌  ${name}: ${err.message}`)
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

/**
 * Run a scenario sequentially (combines setupSteps + bodySteps in order).
 * Honours --scenario and --step filters.
 */
async function scenario(def: ScenarioDef): Promise<void> {
  const filter = effectiveScenarioFilter()
  const allSteps = [...def.setupSteps, ...def.bodySteps]

  if (filter && !filter.has(def.num)) {
    console.log(`\n── ${def.name} (skipped — not in filter) ──`)
    for (const [stepName] of allSteps) {
      results.push({ name: stepName, status: 'skip', ms: 0 })
      console.log(`  ⏭   ${stepName} (skipped)`)
    }
    return
  }

  console.log(`\n── ${def.name} ──`)
  let failed = false
  for (const [stepName, fn] of allSteps) {
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

/**
 * Run the body steps of a single scenario (used in parallel mode).
 * prefix is printed before each step result, e.g. "[S1]".
 */
async function runScenarioBody(def: ScenarioDef, prefix: string): Promise<void> {
  console.log(`\n${prefix} ── ${def.name} ──`)
  let failed = false
  for (const [stepName, fn] of def.bodySteps) {
    const stepId = stepName.trim().split(/\s+/)[0]
    const stepFiltered = STEP_FILTER && !STEP_FILTER.has(stepId)

    if (failed || stepFiltered) {
      results.push({ name: stepName, status: 'skip', ms: 0 })
      console.log(`${prefix}  ⏭   ${stepName} (skipped${stepFiltered ? ' — not in --step filter' : ''})`)
      continue
    }
    try {
      await step(stepName, fn, prefix)
    } catch {
      failed = true
    }
  }
}

/**
 * Run scenarios in two phases:
 *   1. All setupSteps across all scenarios execute sequentially (preserves meta.count order).
 *   2. All bodySteps execute concurrently via Promise.allSettled.
 *
 * Failures in one scenario body do not abort other scenarios.
 */
async function runScenariosParallel(defs: ScenarioDef[]): Promise<void> {
  const filter = effectiveScenarioFilter()
  const activeDefs = defs.filter(d => !filter || filter.has(d.num))
  const skippedDefs = defs.filter(d => filter && !filter.has(d.num))
  const parallelDefs = activeDefs.filter(d => !d.sequentialOnly)
  const sequentialDefs = activeDefs.filter(d => d.sequentialOnly)

  // Mark skipped scenarios up-front
  for (const def of skippedDefs) {
    console.log(`\n── ${def.name} (skipped — not in filter) ──`)
    for (const [stepName] of [...def.setupSteps, ...def.bodySteps]) {
      results.push({ name: stepName, status: 'skip', ms: 0 })
      console.log(`  ⏭   ${stepName} (skipped)`)
    }
  }

  // ── Phase 1: Sequential setup (proposal creation must be in order) ──────
  console.log('\n' + '═'.repeat(64))
  console.log('  Phase 1 — Sequential setup (proposal creation)')
  console.log('═'.repeat(64))
  const failedSetupNums = new Set<number>()
  for (const def of parallelDefs) {
    if (def.setupSteps.length === 0) continue
    console.log(`\n── ${def.name} — setup ──`)
    let failed = false
    for (const [stepName, fn] of def.setupSteps) {
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
    if (failed) failedSetupNums.add(def.num)
  }

  // ── Phase 2: Parallel bodies ──────────────────────────────────────────
  console.log('\n' + '═'.repeat(64))
  console.log(`  Phase 2 — Parallel scenario bodies (${parallelDefs.filter(d => d.bodySteps.length > 0).length} concurrent)`)
  console.log('═'.repeat(64))
  // Skip body steps for any scenario whose setup failed — avoid running against missing/stale state
  for (const def of parallelDefs.filter(d => failedSetupNums.has(d.num))) {
    console.log(`\n[S${def.num}] ── ${def.name} — body skipped (setup failed) ──`)
    for (const [stepName] of def.bodySteps) {
      results.push({ name: stepName, status: 'skip', ms: 0 })
      console.log(`  ⏭   ${stepName} (skipped — setup failed)`)
    }
  }
  await Promise.allSettled(
    parallelDefs
      .filter(d => d.bodySteps.length > 0 && !failedSetupNums.has(d.num))
      .map(def => runScenarioBody(def, `[S${def.num}]`))
  )

  if (sequentialDefs.length > 0) {
    console.log('\n' + '═'.repeat(64))
    console.log('  Phase 3 — Sequential-only scenarios')
    console.log('═'.repeat(64))
    for (const def of sequentialDefs) {
      await scenario(def)
    }
  }
}

// ─── Utilities ───────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms))
}

/**
 * Sleep until a specific *on-chain derived* timestamp (e.g. a proposal's `reviewEnd`/
 * `votingEnd`/`applyEligibleAt`) has passed, plus a small buffer — rather than sleeping a fixed
 * duration measured from "now".
 *
 * Why this matters: in the v2 timing model, phase boundaries are strictly derived from the
 * proposal's `startTime` (fixed at creation) and are NOT elastic — they don't shift based on when
 * transition transactions actually execute. A fixed "sleep `phaseDuration + buffer` from now"
 * implicitly assumes "now ≈ the start of this phase", which only holds when steps run back-to-back
 * with near-constant latency (i.e. sequential mode). Under `--parallel` contention, the gap
 * between proposal creation and when a scenario's body actually gets to run can grow large *and
 * variable*, so "now" drifts arbitrarily far ahead of the proposal's nominal boundaries — and a
 * fixed-duration sleep on top compounds that drift, potentially overshooting not just the
 * intended boundary but the *next* one too (exactly what caused the parallel-mode "Voting period
 * has ended" failure on step 1.6).
 *
 * Anchoring the wait to the actual derived timestamp (fetched fresh from the API/account) makes
 * the pacing self-correcting regardless of how much wall-clock drift preceded it.
 */
async function sleepUntilTimestamp(targetMs: number, label: string, bufferMs = 5_000): Promise<void> {
  const remaining = targetMs - Date.now()
  if (remaining > 0) {
    const waitMs = remaining + bufferMs
    console.log(
      `    Waiting ${(waitMs / 1000).toFixed(1)}s for ${label} ` +
        `(${(remaining / 1000).toFixed(1)}s remaining + ${(bufferMs / 1000).toFixed(1)}s buffer)...`,
    )
    await sleep(waitMs)
  } else {
    console.log(
      `    ${label} already elapsed ~${(-remaining / 1000).toFixed(1)}s ago — proceeding without ` +
        `waiting (this scenario's pacing fell behind, likely due to contention; downstream steps ` +
        `may now be racing a later boundary too).`,
    )
  }
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
 * Defensively parse a response body. DAO APIs may arrive as raw JSON strings, or as already
 * parsed objects containing Shardus bigint sentinel objects; round-tripping parsed objects
 * revives those sentinel objects into native BigInt values for assertions.
 */
function safeParse(data: unknown): any {
  return typeof data === 'string' ? Utils.safeJsonParse(data) : Utils.safeJsonParse(Utils.safeStringify(data))
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

function daoMetaId(): string {
  return ShardusCrypto.hash('dao proposals meta')
}

function nowPlus(ms: number): number {
  return Date.now() + ms
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
  to?: string
  transactionFee?: bigint | string | number | { dataType?: string; value?: string }
  additionalInfo?: any
}

/**
 * Poll GET /transaction/:txId until the app receipt is available.
 * Inject returns success when the TX is queued; apply success/failure is on the receipt.
 */
async function tryWaitForTxReceipt(txId: string, timeoutMs = txSettleTimeoutMs): Promise<TxReceipt | null> {
  let receipt: TxReceipt | null = null
  try {
    await pollUntil(
      async () => {
        try {
          const res = await apiGet(`/transaction/${txId}`)
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
      timeoutMs,
      2_000,
    )
  } catch {
    return null
  }
  return receipt
}

async function waitForTxReceipt(txId: string): Promise<TxReceipt> {
  const receipt = await tryWaitForTxReceipt(txId)
  assert(receipt !== null, `Timed out waiting for receipt ${txId} after ${txSettleTimeoutMs}ms`)
  return receipt
}

/**
 * Some validate-stage DAO rejects are queued and dropped without an app receipt.
 * This helper still fails if a success receipt appears, while allowing callers
 * to assert state stayed unchanged when no receipt is produced.
 */
async function injectExpectRejectOrNoReceipt<T extends object>(
  tx: T,
  account: TestAccount,
  reasonIncludes?: string,
): Promise<{ reason: string; receipt?: TxReceipt; result?: any }> {
  await signTx(tx, account)
  if (VERBOSE) console.log('  → TX (expect reject/no receipt):', Utils.safeStringify(tx))
  let result: any
  try {
    const res = await apiPost('/inject', { tx: Utils.safeStringify(tx) })
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

  let reason = ''
  let receipt: TxReceipt | undefined
  if (result?.success === true && result.txId) {
    receipt = (await tryWaitForTxReceipt(result.txId)) ?? undefined
    if (receipt) {
      if (VERBOSE) console.log('  ← Receipt:', JSON.stringify(receipt))
      assert(receipt.success !== true, `Expected TX to be rejected but receipt succeeded`)
      reason = receipt.reason ?? ''
    }
  } else {
    assert(result?.success !== true, `Expected TX to be rejected but inject succeeded without failure`)
    reason = result?.reason ?? ''
  }

  if (reasonIncludes && reason) {
    assert(
      reason.toLowerCase().includes(reasonIncludes.toLowerCase()),
      `Expected rejection reason to include "${reasonIncludes}", got: "${reason}"`,
    )
  }
  return { reason, receipt, result }
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
    res = await apiPost('/inject', { tx: Utils.safeStringify(tx) })
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
): Promise<{ reason: string; receipt?: TxReceipt; result?: any }> {
  await signTx(tx, account)
  if (VERBOSE) console.log('  → TX (expect reject):', Utils.safeStringify(tx))
  let result: any
  try {
    const res = await apiPost('/inject', { tx: Utils.safeStringify(tx) })
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
  let receipt: TxReceipt | undefined
  if (result?.success === true && result.txId) {
    receipt = await waitForTxReceipt(result.txId)
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
  return { reason, receipt, result }
}

/**
 * DaoProposalAccount only stores `creationTime`/`startTime` — every other phase-boundary
 * timestamp (reviewEnd, votingStart, votingEnd, claimEnd, applyEligibleAt) is derived from
 * those plus the duration snapshots (see src/accounts/daoProposalAccount.ts) and decorated
 * onto the API response by `withDerivedTiming` in src/api/dao/proposals.ts. This local type
 * mirrors that decorated shape so assertions below can read the derived fields directly.
 */
type DaoProposalWithTiming = DaoProposalAccount & {
  reviewEnd: number
  votingStart: number
  votingEnd: number
  claimEnd: number
  applyEligibleAt: number
}

/**
 * Fetch proposal #n via /dao/proposals/:n — polls until the account exists post-apply.
 */
async function getProposal(n: number): Promise<DaoProposalWithTiming> {
  let proposal: DaoProposalWithTiming | null = null
  await pollUntil(
    async () => {
      try {
        const res = await apiGet(`/dao/proposals/${n}`)
        const body = safeParse(res.data)
        if (body?.proposal != null) {
          proposal = body.proposal as DaoProposalWithTiming
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
    const res = await apiGet(`/account/${address}`)
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
    res = await apiGet('/dao/proposals/meta')
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

async function getNetworkParameters(): Promise<any> {
  const res = await apiGet('/network/parameters')
  return safeParse(res.data)?.parameters
}

async function getDaoParameters(): Promise<any> {
  return (await getNetworkParameters())?.current?.dao
}

async function getProposalListOfChanges(): Promise<any[]> {
  return (await getNetworkParameters())?.listOfChanges ?? []
}

async function getCurrentNetworkValue(key: string): Promise<unknown> {
  return (await getNetworkParameters())?.current?.[key]
}

async function getTransactionFeeWei(): Promise<bigint> {
  const current = (await getNetworkParameters())?.current
  if (!current?.transactionFee) return 0n
  const stabilityFactorStr = current.stabilityFactorStr ?? '1'
  return ethers.parseEther(String(current.transactionFee)) * ethers.parseEther(String(stabilityFactorStr)) / 10n ** 18n
}

type ProposalType = 'governance' | 'economic' | 'protocol'

interface ProposalCreateOptions {
  proposer: TestAccount
  proposalType?: ProposalType
  emergency?: boolean
  description: string
  options?: string[]
  changes: Array<{ key: string; value: string; current: string }>
  gracePeriodMs: number
  startTime?: number
}

function proposalPayloadKey(type: ProposalType): 'governance' | 'economic' | 'protocol' {
  return type
}

async function createDaoProposal(opts: ProposalCreateOptions): Promise<number> {
  const proposalType = opts.proposalType ?? 'governance'
  const proposalNumber = await nextProposalNumber()
  const tx: any = {
    type: 'dao_proposal_create',
    networkId: currentNetworkId,
    from: opts.proposer.address,
    proposalId: daoProposalId(proposalNumber),
    metaId: daoMetaId(),
    proposalType,
    emergency: opts.emergency ?? false,
    description: opts.description,
    options: opts.options ?? ['yes', 'no'],
    gracePeriod: opts.gracePeriodMs,
    [proposalPayloadKey(proposalType)]: { changes: opts.changes },
    timestamp: Date.now(),
  }
  if (opts.startTime !== undefined) tx.startTime = opts.startTime
  await injectAndAssert(tx, opts.proposer)
  return proposalNumber
}

async function committeeAcceptToVoting(proposalNumber: number, actor: TestAccount, committee: TestAccount[], sleepBufferMs: number): Promise<void> {
  for (let i = 0; i < 3; i++) {
    await injectAndAssert(
      {
        type: 'dao_committee_vote',
        networkId: currentNetworkId,
        from: committee[i].address,
        proposalId: daoProposalId(proposalNumber),
        vote: 'accept',
        timestamp: Date.now(),
      },
      committee[i],
    )
  }
  const proposalBeforeResult = await getProposal(proposalNumber)
  await sleepUntilTimestamp(proposalBeforeResult.reviewEnd, 'reviewEnd', sleepBufferMs)
  await injectAndAssert(
    {
      type: 'dao_committee_result',
      networkId: currentNetworkId,
      from: actor.address,
      proposalId: daoProposalId(proposalNumber),
      timestamp: Date.now(),
    },
    actor,
  )
  const proposal = await getProposal(proposalNumber)
  assert(proposal.status === 'voting', `Expected proposal ${proposalNumber} to be voting, got ${proposal.status}`)
}

async function castVote(proposalNumber: number, voter: TestAccount, weights: number[], spendLib: number): Promise<any> {
  return injectAndAssert(
    {
      type: 'dao_vote',
      networkId: currentNetworkId,
      from: voter.address,
      proposalId: daoProposalId(proposalNumber),
      weights,
      spend: libToWei(spendLib),
      timestamp: Date.now(),
    },
    voter,
  )
}

async function finalizeVote(proposalNumber: number, actor: TestAccount, sleepBufferMs: number): Promise<any> {
  const proposalBeforeResult = await getProposal(proposalNumber)
  await sleepUntilTimestamp(proposalBeforeResult.votingEnd, 'votingEnd', sleepBufferMs)
  return injectAndAssert(
    {
      type: 'dao_vote_result',
      networkId: currentNetworkId,
      from: actor.address,
      proposalId: daoProposalId(proposalNumber),
      timestamp: Date.now(),
    },
    actor,
  )
}

async function applyAcceptedProposal(proposalNumber: number, actor: TestAccount, sleepBufferMs: number): Promise<any> {
  const proposalBeforeApply = await getProposal(proposalNumber)
  await sleepUntilTimestamp(proposalBeforeApply.applyEligibleAt, 'applyEligibleAt', sleepBufferMs)
  return injectAndAssert(
    {
      type: 'dao_apply_parameters',
      networkId: currentNetworkId,
      from: actor.address,
      proposalId: daoProposalId(proposalNumber),
      timestamp: Date.now(),
    },
    actor,
  )
}

function assertReceiptTargetsProposal(receipt: TxReceipt, proposalNumber: number): void {
  assert((receipt as any).to === daoProposalId(proposalNumber), `Expected receipt.to to be proposal id for #${proposalNumber}, got ${(receipt as any).to}`)
}

function assertFailedReceiptCharged(receipt: TxReceipt): void {
  assert(asBigInt(receipt.transactionFee ?? 0n) > 0n, `Expected failed DAO receipt to charge a tx fee, got ${String(receipt.transactionFee ?? 0)}`)
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
    res = await apiPost('/inject', { tx: Utils.safeStringify(tx) })
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
 * Fetch the active node list from the archiver and return one node's host:port,
 * replacing the previously hardcoded localhost:9001.
 */
async function pickActiveHost(): Promise<string> {
  const res = await axios.get(`http://${ARCHIVER_HOST}/nodelist`)
  const nodeList: Array<{ ip: string; port: number }> = res.data?.nodeList ?? []
  assert(nodeList.length > 0, 'Archiver returned an empty nodelist')
  const node = nodeList[Math.floor(Math.random() * nodeList.length)]
  return `${node.ip}:${node.port}`
}

/** GET against a freshly-picked node from the archiver's /nodelist. */
async function apiGet(urlPath: string, config?: Parameters<typeof axios.get>[1]) {
  const host = await pickActiveHost()
  return axios.get(`http://${host}${urlPath}`, config)
}

/** POST against a freshly-picked node from the archiver's /nodelist. */
async function apiPost(urlPath: string, body: unknown, config?: Parameters<typeof axios.post>[2]) {
  const host = await pickActiveHost()
  return axios.post(`http://${host}${urlPath}`, body, config)
}

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
        const res = await apiGet('/network/parameters')
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

// Default short DAO durations (ms) for the E2E run, used unless overridden in process.env.
const E2E_DAO_DURATION_DEFAULTS: Record<string, string> = {
  DAO_REVIEW_DURATION_MS: '90000',
  DAO_VOTING_DURATION_MS: '90000',
  DAO_GRACE_DURATION_MS: '30000',
  DAO_CLAIM_DURATION_MS: '150000',
  CYCLE_DURATION: '16',
}

async function startNetwork(): Promise<void> {
  console.log('Starting 10-node network with short DAO durations...')
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
    env: { ...E2E_DAO_DURATION_DEFAULTS, ...process.env },
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

  // Restore or create test participant accounts.
  // On a --no-start / --step run we load the saved state so retried steps target
  // the exact same accounts and proposals as the original run.
  const savedState = NO_START ? loadRunState() : null
  if (savedState) {
    console.log(`  Restored run state from ${RUN_STATE_PATH}`)
    console.log(`  Saved networkId: ${savedState.networkId}`)
  }

  const savedProposerKeys = savedState?.proposerKeys ?? (savedState?.proposerKey ? [savedState.proposerKey] : [])
  const savedVoterKeys = savedState?.voterKeys ?? [savedState?.voter1Key, savedState?.voter2Key].filter((k): k is string => Boolean(k))
  const makePool = (savedKeys: string[], count: number): TestAccount[] => {
    const accounts = savedKeys.slice(0, count).map(k => makeAccountFromPrivateKey(k))
    while (accounts.length < count) accounts.push(makeAccount())
    return accounts
  }
  const proposers = makePool(savedProposerKeys, 3)
  const voters = makePool(savedVoterKeys, 8)
  const [proposer, proposer2, proposer3] = proposers
  const [voter1, voter2, voter3, voter4, voter5, voter6, voter7, voter8] = voters

  const proposalNumbers: Record<string, number> = {
    ...(savedState?.proposalNumbers ?? {}),
    ...(savedState?.sc1ProposalN ? { sc1: savedState.sc1ProposalN } : {}),
    ...(savedState?.sc2ProposalN ? { sc2: savedState.sc2ProposalN } : {}),
    ...(savedState?.sc3ProposalN ? { sc3: savedState.sc3ProposalN } : {}),
    ...(savedState?.sc4ProposalN ? { sc4: savedState.sc4ProposalN } : {}),
    ...(savedState?.sc5ProposalN ? { sc5: savedState.sc5ProposalN } : {}),
  }
  const getProposalN = (key: string): number => proposalNumbers[key] ?? 0
  const setProposalN = (key: string, value: number): number => {
    proposalNumbers[key] = value
    return value
  }

  let sc1ProposalN = getProposalN('sc1')
  let sc2ProposalN = getProposalN('sc2')
  let sc3ProposalN = getProposalN('sc3')
  let sc4ProposalN = getProposalN('sc4')
  let sc5ProposalN = getProposalN('sc5')
  let sc6ProposalN = getProposalN('sc6')
  let sc7ProposalN = getProposalN('sc7')
  let sc8EconomicProposalN = getProposalN('sc8Economic')
  let sc8ProtocolProposalN = getProposalN('sc8Protocol')
  let sc9ProposalN = getProposalN('sc9')
  let sc10ProposalN = getProposalN('sc10')
  let sc11ProposalN = getProposalN('sc11')
  let sc12ProposalN = getProposalN('sc12')
  let sc13ProposalN = getProposalN('sc13')

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

  // Warn if the saved network ID doesn't match — proposal numbers from a previous network are invalid.
  if (savedState && savedState.networkId !== networkId) {
    console.log(`  ⚠️  Run-state networkId mismatch!`)
    console.log(`  ⚠️  Saved: ${savedState.networkId}`)
    console.log(`  ⚠️  Current: ${networkId}`)
    console.log(`  ⚠️  Restored accounts and proposal numbers may not match this network.`)
  }

  // Snapshot all mutable run-state variables and persist to disk.
  // Called once after waitForNetwork() on a fresh run, then again after every
  // proposal-creation setup step so --step retries always have current data.
  function saveCurrentRunState(): void {
    saveRunState({
      networkId: currentNetworkId,
      proposerKeys: proposers.map(a => a.wallet.privateKey),
      voterKeys: voters.map(a => a.wallet.privateKey),
      proposalNumbers: {
        ...proposalNumbers,
        sc1: sc1ProposalN,
        sc2: sc2ProposalN,
        sc3: sc3ProposalN,
        sc4: sc4ProposalN,
        sc5: sc5ProposalN,
        sc6: sc6ProposalN,
        sc7: sc7ProposalN,
        sc8Economic: sc8EconomicProposalN,
        sc8Protocol: sc8ProtocolProposalN,
        sc9: sc9ProposalN,
        sc10: sc10ProposalN,
        sc11: sc11ProposalN,
        sc12: sc12ProposalN,
        sc13: sc13ProposalN,
      },
    })
  }

  // On a fresh run, immediately persist the account keys so they're available
  // for --step retries even if the run is interrupted before any proposals are created.
  if (!NO_START) saveCurrentRunState()

  // Derived timing constants
  const applyParamsPollMs = cycleDurationMs * 5   // global message fires at cycle+3
  const SLEEP_BUFFER_MS = 5_000
  // In --parallel mode, multiple scenario bodies submit overlapping transactions onto the same
  // network concurrently, which measurably increases per-tx queue/confirmation latency (we saw a
  // decisive dao_committee_vote blow past the default 2-cycle budget and time out at 37s under
  // 5-way concurrency). Give receipts more cycles' worth of headroom to settle when running
  // concurrently so a slow-but-successful confirmation doesn't get misreported as a failure.
  txSettleTimeoutMs = cycleDurationMs * (PARALLEL ? 5 : 2) + SLEEP_BUFFER_MS

  const minVoteSpendLib = usdStrToLibCeil(minimumSpendUsdStr, stabilityFactorStr)
  console.log(`Funding: ${TEST_ACCOUNT_FUND_LIB} LIB per account; min dao_vote spend≈${minVoteSpendLib} LIB`)

  // ─────────────────────────────────────────────────────────────────────────
  // Scenario 1 — Happy path: governance proposal → accepted → applied → claimed
  // ─────────────────────────────────────────────────────────────────────────
  const sc1: ScenarioDef = {
    num: 1,
    name: 'Scenario 1 — Happy path (governance → accepted → applied → claimed)',
    setupSteps: [
    [
      '1.1  Fund all accounts',
      async () => {
        await Promise.all([
          ...proposers.map(a => fundAccount(a, TEST_ACCOUNT_FUND_LIB)),
          ...voters.map(a => fundAccount(a, TEST_ACCOUNT_FUND_LIB)),
          ...committee.map(c => fundAccount(c, TEST_ACCOUNT_FUND_LIB)),
        ])
      },
    ],

    [
      '1.2  dao_proposal_create (governance: voteExponent 1.1 → 1.2)',
      async () => {
        sc1ProposalN = await nextProposalNumber()
        saveCurrentRunState()
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
        assert(Array.isArray(proposal.committeeAddresses) && proposal.committeeAddresses.length > 0, 'Expected committeeAddresses snapshot to be non-empty')
      },
    ],
    ],
    bodySteps: [
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
        const acceptCount = proposal.committeeVotes.filter((v) => v.vote === 'accept').length
        assert(acceptCount === 1, `Expected 1 accept vote, got ${acceptCount}`)
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
        const acceptCount = proposal.committeeVotes.filter((v) => v.vote === 'accept').length
        assert(acceptCount === 2, `Expected 2 accept votes, got ${acceptCount}`)
        assert(proposal.status === 'review', `Expected status still 'review', got '${proposal.status}'`)
      },
    ],

    [
      '1.5  committee_vote accept #3 → decisive (3-of-5), but regular proposals still wait for reviewEnd',
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
        // Decisive committee accept does not fast-track regular proposals — dao_committee_vote
        // never flips status early; only dao_committee_result (after reviewEnd) does.
        assert(proposal.status === 'review', `Expected status still 'review' (decisive accept does not fast-track regular proposals), got '${proposal.status}'`)
      },
    ],

    [
      '1.5b  Sleep past reviewEnd, then dao_committee_result → status voting',
      async () => {
        // Anchor the wait to the proposal's actual derived reviewEnd (not a fixed duration from
        // "now") — see sleepUntilTimestamp's doc comment for why this matters under contention.
        const proposalBefore = await getProposal(sc1ProposalN)
        await sleepUntilTimestamp(proposalBefore.reviewEnd, 'reviewEnd', SLEEP_BUFFER_MS)
        await injectAndAssert(
          {
            type: 'dao_committee_result',
            networkId: currentNetworkId,
            from: proposer.address,
            proposalId: daoProposalId(sc1ProposalN),
            timestamp: Date.now(),
          },
          proposer,
        )
        const proposal = await getProposal(sc1ProposalN)
        assert(proposal.status === 'voting', `Expected status 'voting', got '${proposal.status}'`)
        assert(asBigInt(proposal.voterRewardPool) > 0n, 'Expected voterRewardPool funded with proposal fee on review → voting transition')
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
            // weights[i] maps 1:1 by index onto proposal.options[i] — [1, 0] puts the vote's
            // entire weight on options[0] ('yes'), mirroring the old optionIndex: 0 behavior.
            weights: [1, 0],
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
            // weights[i] maps 1:1 by index onto proposal.options[i] — [1, 0] puts the vote's
            // entire weight on options[0] ('yes'), mirroring the old optionIndex: 0 behavior.
            weights: [1, 0],
            spend: libToWei(minVoteSpendLib),
            timestamp: Date.now(),
          },
          voter2,
        )
        const proposal = await getProposal(sc1ProposalN)
        assert(asBigInt(proposal.totalVote[0]) > 0n, 'Expected totalVote[0] > 0 after votes')
        assert(asBigInt(proposal.voterRewardPool) > 0n, 'Expected voterRewardPool > 0 after vote spend')
      },
    ],

    [
      '1.7  Sleep past votingEnd then dao_vote_result → accepted',
      async () => {
        const proposalBefore = await getProposal(sc1ProposalN)
        await sleepUntilTimestamp(proposalBefore.votingEnd, 'votingEnd', SLEEP_BUFFER_MS)
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
        // voterRewardPool is now the fixed, immutable post-burn pool — assert the burn actually
        // reduced it relative to the pre-vote_result (pre-burn) value.
        assert(asBigInt(proposal.voterRewardPool) > 0n, 'Expected voterRewardPool > 0 after burn')
        assert(
          asBigInt(proposal.voterRewardPool) < asBigInt(proposalBefore.voterRewardPool),
          `Expected voterRewardPool to shrink after burn (before=${proposalBefore.voterRewardPool}, after=${proposal.voterRewardPool})`,
        )
        assert(asBigInt(proposal.claimedAmount) === 0n, `Expected claimedAmount = 0 immediately after vote_result, got ${proposal.claimedAmount}`)
        assert(proposal.claimEnd > 0, `Expected claimEnd > 0, got ${proposal.claimEnd}`)
      },
    ],

    [
      '1.8  Non-voter (proposer) tries dao_claim_reward on accepted proposal → rejected',
      async () => {
        // Run immediately after 1.7 (right at votingEnd, while the full claimDuration window is
        // still ahead) rather than after the grace-period sleep in 1.9. claimEnd is now strictly
        // derived (= votingEnd + claimDuration, independent of when dao_vote_result actually
        // executes), so any extra delay eats directly into the claim window margin — running the
        // "did not vote" check here (instead of after 1.9's ~88s grace-period sleep) keeps us
        // comfortably inside the window. Validation order is intentional: the time-window check
        // in dao_claim_reward.validate() runs before the voter-membership check, so a
        // late-arriving tx correctly reports "Claim period has ended" rather than "did not vote" —
        // this step's whole point is to assert the *voter-membership* rejection, hence the need
        // to run it well within the window.
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
      '1.9  Sleep past graceDuration, dao_apply_parameters → applied + network param updated',
      async () => {
        const proposalBefore = await getProposal(sc1ProposalN)
        await sleepUntilTimestamp(proposalBefore.applyEligibleAt, 'applyEligibleAt (grace period end)', SLEEP_BUFFER_MS)
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
            const r = await apiGet('/network/parameters')
            return r.data?.parameters?.current?.dao?.voteExponent === 1.2
          } catch {
            return false
          }
        }, applyParamsPollMs)

        const r = await apiGet('/network/parameters')
        const listOfChanges: any[] = r.data?.parameters?.listOfChanges ?? []
        const hasChange = listOfChanges.some((c: any) => c?.appData?.dao?.voteExponent === 1.2)
        assert(
          hasChange,
          `Expected listOfChanges to contain appData.dao.voteExponent=1.2, got: ${JSON.stringify(listOfChanges)}`,
        )
      },
    ],

    [
      '1.10 dao_claim_reward (voter1 + voter2)',
      async () => {
        // NOTE: dao_claim_reward's payout is explicitly *time-weighted* — see apply():
        //   previousTimestamp = (first voter) ? getVotingStart(proposal) : prior voter's timestamp
        //   timeDelta         = voterEntry.timestamp - previousTimestamp
        //   reward            = voterRewardPool * (timeDelta/votingDuration/2 + 1/voterCount/2)
        // So "both voters spent the same amount" does NOT imply "near-equal rewards" — the
        // formula rewards voters based on the *gap* between their vote and the previous voter's
        // (or votingStart for the first voter), not on spend size. Two equal-spend votes cast
        // even ~5-10s apart relative to a 60s votingDuration can legitimately differ by >10%
        // (confirmed: observed an 11.62% diff explained almost exactly by the recorded
        // voterList timestamps — timeDelta1≈13.0s, timeDelta2≈8.0s — when this assertion was
        // a flat "<5% near-equal" check). Asserting near-equality is therefore an incorrect
        // test premise, not a timing-margin issue to paper over with a looser tolerance.
        //
        // Instead, fetch the finalized proposal (voterList timestamps, votingStart,
        // votingDuration, and the immutable voterRewardPool snapshot are all frozen once
        // dao_vote_result has run) and independently recompute each voter's *exact* expected
        // reward via the same formula — then assert the actual claimed amount matches exactly.
        // This verifies the distribution mechanism precisely, with zero sensitivity to timing.
        const proposalForReward = await getProposal(sc1ProposalN)
        const REWARD_PRECISION = 10n ** 18n
        const computeExpectedReward = (voterAddress: string, claimedSoFar: bigint): bigint => {
          const voterIndex = proposalForReward.voterList.findIndex(v => v.address === voterAddress)
          assert(voterIndex !== -1, `${voterAddress} not found in proposal.voterList`)
          const voterEntry = proposalForReward.voterList[voterIndex]
          const previousTimestamp =
            voterIndex === 0 ? proposalForReward.votingStart : proposalForReward.voterList[voterIndex - 1].timestamp
          const timeDelta = BigInt(voterEntry.timestamp - previousTimestamp)
          const votingDuration = BigInt(proposalForReward.votingDuration)
          const N = BigInt(proposalForReward.voterList.length)
          const timePart = (timeDelta * REWARD_PRECISION) / votingDuration
          const equalPart = REWARD_PRECISION / N
          const rewardNumerator = asBigInt(proposalForReward.voterRewardPool) * (timePart + equalPart)
          let reward = rewardNumerator / (2n * REWARD_PRECISION)
          const remainingPool = asBigInt(proposalForReward.voterRewardPool) - claimedSoFar
          if (reward > remainingPool) reward = remainingPool
          return reward
        }
        const expectedVoter1Reward = computeExpectedReward(voter1.address, 0n)
        const expectedVoter2Reward = computeExpectedReward(voter2.address, expectedVoter1Reward)

        const { receipt: claim1Receipt } = await injectAndAssert(
          {
            type: 'dao_claim_reward',
            networkId: currentNetworkId,
            from: voter1.address,
            proposalId: daoProposalId(sc1ProposalN),
            timestamp: Date.now(),
          },
          voter1,
        )
        const { receipt: claim2Receipt } = await injectAndAssert(
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

        const voter1Reward = asBigInt(claim1Receipt.additionalInfo.reward)
        const voter2Reward = asBigInt(claim2Receipt.additionalInfo.reward)
        assert(voter1Reward > 0n, 'voter1 received a zero reward')
        assert(voter2Reward > 0n, 'voter2 received a zero reward')
        assert(
          voter1Reward === expectedVoter1Reward,
          `voter1 claimed reward ${voter1Reward} != expected time-weighted reward ${expectedVoter1Reward} ` +
            `(formula: voterRewardPool * (timeDelta/votingDuration/2 + 1/voterCount/2) — see dao_claim_reward.apply)`,
        )
        assert(
          voter2Reward === expectedVoter2Reward,
          `voter2 claimed reward ${voter2Reward} != expected time-weighted reward ${expectedVoter2Reward} ` +
            `(formula: voterRewardPool * (timeDelta/votingDuration/2 + 1/voterCount/2) — see dao_claim_reward.apply)`,
        )
        console.log(
          `    Rewards (time-weighted, verified exact against formula): ` +
            `voter1 +${ethers.formatEther(voter1Reward)} LIB, voter2 +${ethers.formatEther(voter2Reward)} LIB`,
        )
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
    ],
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Scenario 2 — Withheld path
  // ─────────────────────────────────────────────────────────────────────────
  const sc2: ScenarioDef = {
    num: 2,
    name: 'Scenario 2 — Withheld path',
    setupSteps: [
    [
      '2.1  dao_proposal_create (new governance proposal)',
      async () => {
        sc2ProposalN = await nextProposalNumber()
        saveCurrentRunState()
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
    ],
    bodySteps: [
    [
      '2.2  committee_vote withhold x3 → decisive withhold, status withheld',
      async () => {
        // Use committee[2..4] (not [0..2]) to avoid concurrent account-lock conflicts in parallel
        // mode: S1 and S4 both start their body with committee[0] at the same time as S2, causing
        // cant_preApply failures on the shared from-account execution shard. Starting from index 2
        // ensures S2's first vote has no temporal overlap with S1/S4's first votes.
        for (let i = 2; i < 5; i++) {
          await injectAndAssert(
            {
              type: 'dao_committee_vote',
              networkId: currentNetworkId,
              from: committee[i].address,
              proposalId: daoProposalId(sc2ProposalN),
              vote: 'withhold',
              withheldReason: 'Test withhold',
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
    ],
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Scenario 3 — Auto-accept via dao_committee_result
  // ─────────────────────────────────────────────────────────────────────────
  const sc3: ScenarioDef = {
    num: 3,
    name: 'Scenario 3 — Auto-accept via committee_result (no committee votes submitted)',
    setupSteps: [
    [
      '3.1  dao_proposal_create (non-emergency, no votes will be submitted)',
      async () => {
        sc3ProposalN = await nextProposalNumber()
        saveCurrentRunState()
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
    ],
    bodySteps: [
    [
      '3.2  Sleep past reviewEnd',
      async () => {
        const proposalBefore = await getProposal(sc3ProposalN)
        await sleepUntilTimestamp(proposalBefore.reviewEnd, 'reviewEnd', SLEEP_BUFFER_MS)
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
    ],
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Scenario 4 — Emergency proposal path
  // ─────────────────────────────────────────────────────────────────────────
  const sc4: ScenarioDef = {
    num: 4,
    name: 'Scenario 4 — Emergency proposal path',
    setupSteps: [
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
        saveCurrentRunState()
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
    ],
    bodySteps: [
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
      '4.5  votingEnd derived (collapses onto votingStart/reviewEnd — zero-length nominal voting phase)',
      async () => {
        const proposal = await getProposal(sc4ProposalN)
        // Emergency proposals derive every phase boundary from startTime, same as regular ones —
        // "emergency" speeds up the *decision* (status flips to 'accepted' early on a decisive
        // committee vote), not the nominal apply-eligibility schedule. Per the derivation
        // formulas (getVotingEnd in src/accounts/daoProposalAccount.ts), emergency proposals have
        // a zero-length nominal voting phase: votingEnd === votingStart === reviewEnd.
        assert(proposal.votingEnd > 0, `Expected votingEnd > 0, got ${proposal.votingEnd}`)
        assert(
          proposal.votingEnd === proposal.votingStart && proposal.votingStart === proposal.reviewEnd,
          `Expected votingEnd === votingStart === reviewEnd for emergency proposal, got votingEnd=${proposal.votingEnd}, votingStart=${proposal.votingStart}, reviewEnd=${proposal.reviewEnd}`,
        )
      },
    ],
    ],
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Scenario 5 — Access control & rejection cases
  // ─────────────────────────────────────────────────────────────────────────
  const sc5: ScenarioDef = {
    num: 5,
    name: 'Scenario 5 — Access control & rejection cases',
    setupSteps: [
    [
      '5.1  Non-committee address submits committee_vote on fresh review proposal → rejected',
      async () => {
        sc5ProposalN = await nextProposalNumber()
        saveCurrentRunState()
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
    ],
    bodySteps: [
    [
      '5.2  dao_vote on review-status proposal → rejected (not in voting phase)',
      async () => {
        await injectExpectReject(
          {
            type: 'dao_vote',
            networkId: currentNetworkId,
            from: voter1.address,
            proposalId: daoProposalId(sc5ProposalN),
            weights: [1, 0],
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
    ],
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Scenario 6 — Rejected proposal path
  // ─────────────────────────────────────────────────────────────────────────
  const sc6: ScenarioDef = {
    num: 6,
    name: 'Scenario 6 — Rejected proposal path',
    sequentialOnly: true,
    setupSteps: [
    [
      '6.1  Create governance proposal for rejected branch',
      async () => {
        sc6ProposalN = setProposalN('sc6', await createDaoProposal({
          proposer: proposer2,
          description: 'Rejected branch test proposal',
          changes: [{ key: 'pctBurned', value: '55', current: '50' }],
          gracePeriodMs: graceDurationMs,
        }))
        saveCurrentRunState()
      },
    ],
    ],
    bodySteps: [
    [
      '6.2  Advance proposal to voting',
      async () => {
        await committeeAcceptToVoting(sc6ProposalN, proposer2, committee, SLEEP_BUFFER_MS)
      },
    ],
    [
      '6.3  Community votes no → dao_vote_result rejects and burns reward pool',
      async () => {
        await castVote(sc6ProposalN, voter3, [0, 1], minVoteSpendLib)
        await castVote(sc6ProposalN, voter4, [0, 1], minVoteSpendLib)
        const beforeResult = await getProposal(sc6ProposalN)
        const poolBeforeBurn = asBigInt(beforeResult.voterRewardPool)
        const { receipt } = await finalizeVote(sc6ProposalN, proposer2, SLEEP_BUFFER_MS)
        const proposal = await getProposal(sc6ProposalN)
        const burnAmount = asBigInt(receipt.additionalInfo.burnAmount)
        assert(proposal.status === 'rejected', `Expected rejected status, got ${proposal.status}`)
        assert(burnAmount > 0n, `Expected non-zero burnAmount, got ${burnAmount}`)
        assert(asBigInt(proposal.voterRewardPool) > 0n, 'Expected voterRewardPool > 0 after burn on rejected proposal')
        assert(asBigInt(proposal.claimedAmount) === 0n, `Expected claimedAmount = 0 before rejected-branch claims, got ${proposal.claimedAmount}`)
        assert(asBigInt(proposal.voterRewardPool) === poolBeforeBurn - burnAmount, 'Rejected branch did not reduce voterRewardPool by burnAmount')
      },
    ],
    [
      '6.4  Voter can claim reward on rejected proposal',
      async () => {
        const { receipt } = await injectAndAssert(
          {
            type: 'dao_claim_reward',
            networkId: currentNetworkId,
            from: voter3.address,
            proposalId: daoProposalId(sc6ProposalN),
            timestamp: Date.now(),
          },
          voter3,
        )
        const reward = asBigInt(receipt.additionalInfo.reward)
        assert(reward > 0n, 'Expected non-zero claim reward on rejected proposal')
        const proposal = await getProposal(sc6ProposalN)
        assert(asBigInt(proposal.claimedAmount) === reward, `Expected claimedAmount to equal first rejected-branch claim reward ${reward}, got ${proposal.claimedAmount}`)
        assert(asBigInt(proposal.claimedAmount) <= asBigInt(proposal.voterRewardPool), 'Rejected-branch claim exceeded the post-burn voterRewardPool')
      },
    ],
    [
      '6.5  dao_apply_parameters rejected for rejected proposal',
      async () => {
        const changesBefore = await getProposalListOfChanges()
        const rejected = await injectExpectRejectOrNoReceipt(
          {
            type: 'dao_apply_parameters',
            networkId: currentNetworkId,
            from: proposer2.address,
            proposalId: daoProposalId(sc6ProposalN),
            timestamp: Date.now(),
          },
          proposer2,
          'accepted status',
        )
        if (rejected.receipt) {
          assertReceiptTargetsProposal(rejected.receipt, sc6ProposalN)
          assertFailedReceiptCharged(rejected.receipt)
        }
        const proposalAfter = await getProposal(sc6ProposalN)
        const changesAfter = await getProposalListOfChanges()
        assert(proposalAfter.status === 'rejected', `Rejected proposal apply attempt changed status to ${proposalAfter.status}`)
        assert(changesAfter.length === changesBefore.length, 'Rejected proposal apply attempt unexpectedly queued a network change')
      },
    ],
    ],
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Scenario 7 — Multi-option weighted-vote distribution
  // ─────────────────────────────────────────────────────────────────────────
  const sc7: ScenarioDef = {
    num: 7,
    name: 'Scenario 7 — Multi-option weighted-vote distribution',
    sequentialOnly: true,
    setupSteps: [
    [
      '7.1  Create 3-option governance proposal',
      async () => {
        sc7ProposalN = setProposalN('sc7', await createDaoProposal({
          proposer: proposer3,
          description: 'Multi-option weighted vote test proposal',
          options: ['yes', 'no', 'abstain'],
          changes: [{ key: 'voteExponent', value: '1.2', current: '1.5' }],
          gracePeriodMs: graceDurationMs,
        }))
        saveCurrentRunState()
      },
    ],
    ],
    bodySteps: [
    [
      '7.2  Advance proposal to voting',
      async () => {
        await committeeAcceptToVoting(sc7ProposalN, proposer3, committee, SLEEP_BUFFER_MS)
      },
    ],
    [
      '7.3  Cast split votes and verify stable weight invariants',
      async () => {
        const r1 = await castVote(sc7ProposalN, voter5, [3, 5, 2], minVoteSpendLib)
        const r2 = await castVote(sc7ProposalN, voter6, [0, 1, 1], minVoteSpendLib * 2)
        const w1 = r1.receipt.additionalInfo.optionWeights.map(asBigInt)
        const w2 = r2.receipt.additionalInfo.optionWeights.map(asBigInt)
        assert(w1.length === 3 && w2.length === 3, 'Expected receipt optionWeights length to match 3 proposal options')
        assert(w1.every(w => w > 0n), `Expected all non-zero split weights to produce non-zero option weights, got ${w1}`)
        assert(w1[1] > w1[0] && w1[0] > w1[2], `Expected [3,5,2] ordering to be option1 > option0 > option2, got ${w1}`)
        assert(w2[0] === 0n && w2[1] > 0n && w2[2] > 0n, `Expected zero input weight to produce zero option weight, got ${w2}`)

        const proposal = await getProposal(sc7ProposalN)
        const expected = [w1[0] + w2[0], w1[1] + w2[1], w1[2] + w2[2]]
        const actual = proposal.totalVote.map(asBigInt)
        assert(
          actual.length === expected.length && actual.every((w, i) => w === expected[i]),
          `Expected proposal.totalVote ${expected} to equal accumulated receipt optionWeights, got ${actual}`,
        )
      },
    ],
    ],
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Scenario 8 — Economic & protocol proposal types end-to-end
  // ─────────────────────────────────────────────────────────────────────────
  const sc8: ScenarioDef = {
    num: 8,
    name: 'Scenario 8 — Economic & protocol proposal types',
    sequentialOnly: true,
    setupSteps: [
    [
      '8.1  Create economic proposal for top-level network.current key',
      async () => {
        const currentValue = String(await getCurrentNetworkValue('nodeRewardAmountUsdStr'))
        sc8EconomicProposalN = setProposalN('sc8Economic', await createDaoProposal({
          proposer: proposer2,
          proposalType: 'economic',
          description: 'Economic proposal updates nodeRewardAmountUsdStr',
          changes: [{ key: 'nodeRewardAmountUsdStr', value: '1.25', current: currentValue }],
          gracePeriodMs: graceDurationMs,
        }))
        saveCurrentRunState()
      },
    ],
    [
      '8.2  Reject governance proposal using economic-only key',
      async () => {
        const n = await nextProposalNumber()
        await injectExpectReject(
          {
            type: 'dao_proposal_create',
            networkId: currentNetworkId,
            from: proposer2.address,
            proposalId: daoProposalId(n),
            metaId: daoMetaId(),
            proposalType: 'governance',
            emergency: false,
            description: 'Invalid governance namespace test',
            options: ['yes', 'no'],
            gracePeriod: graceDurationMs,
            governance: { changes: [{ key: 'nodeRewardAmountUsdStr', value: '1.5', current: '1.0' }] },
            timestamp: Date.now(),
          },
          proposer2,
          'governance parameters',
        )
      },
    ],
    ],
    bodySteps: [
    [
      '8.3  Economic proposal applies via apply_change_network_param',
      async () => {
        await committeeAcceptToVoting(sc8EconomicProposalN, proposer2, committee, SLEEP_BUFFER_MS)
        await castVote(sc8EconomicProposalN, voter7, [1, 0], minVoteSpendLib)
        await finalizeVote(sc8EconomicProposalN, proposer2, SLEEP_BUFFER_MS)
        await applyAcceptedProposal(sc8EconomicProposalN, proposer2, SLEEP_BUFFER_MS)
        await pollUntil(async () => String(await getCurrentNetworkValue('nodeRewardAmountUsdStr')) === '1.25', applyParamsPollMs)
        const changes = await getProposalListOfChanges()
        assert(changes.some(c => c?.appData?.nodeRewardAmountUsdStr === '1.25'), 'Expected economic change in listOfChanges.appData.nodeRewardAmountUsdStr')
      },
    ],
    [
      '8.4  Create and apply protocol proposal via apply_change_config',
      async () => {
        sc8ProtocolProposalN = setProposalN('sc8Protocol', await createDaoProposal({
          proposer: proposer3,
          proposalType: 'protocol',
          description: 'Protocol proposal patches debug.countEndpointStart',
          changes: [{ key: 'debug', value: '{"countEndpointStart":-1}', current: '{"countEndpointStart":-1}' }],
          gracePeriodMs: graceDurationMs,
        }))
        saveCurrentRunState()
        await committeeAcceptToVoting(sc8ProtocolProposalN, proposer3, committee, SLEEP_BUFFER_MS)
        await castVote(sc8ProtocolProposalN, voter8, [1, 0], minVoteSpendLib)
        await finalizeVote(sc8ProtocolProposalN, proposer3, SLEEP_BUFFER_MS)
        await applyAcceptedProposal(sc8ProtocolProposalN, proposer3, SLEEP_BUFFER_MS)
        await pollUntil(
          async () => {
            const changes = await getProposalListOfChanges()
            return changes.some(c => c?.change?.debug?.countEndpointStart === -1)
          },
          applyParamsPollMs,
        )
      },
    ],
    [
      '8.5  Reject protocol proposal using network-only key',
      async () => {
        const n = await nextProposalNumber()
        await injectExpectReject(
          {
            type: 'dao_proposal_create',
            networkId: currentNetworkId,
            from: proposer3.address,
            proposalId: daoProposalId(n),
            metaId: daoMetaId(),
            proposalType: 'protocol',
            emergency: false,
            description: 'Invalid protocol namespace test',
            options: ['yes', 'no'],
            gracePeriod: graceDurationMs,
            protocol: { changes: [{ key: 'nodeRewardAmountUsdStr', value: '1.5', current: '1.25' }] },
            timestamp: Date.now(),
          },
          proposer3,
          'protocol parameters',
        )
      },
    ],
    ],
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Scenario 9 — Future startTime scheduling regression
  // ─────────────────────────────────────────────────────────────────────────
  const sc9: ScenarioDef = {
    num: 9,
    name: 'Scenario 9 — Future startTime scheduling regression',
    sequentialOnly: true,
    setupSteps: [
    [
      '9.1  Reject proposal with startTime before creation time',
      async () => {
        const n = await nextProposalNumber()
        const timestamp = Date.now()
        await injectExpectReject(
          {
            type: 'dao_proposal_create',
            networkId: currentNetworkId,
            from: proposer2.address,
            proposalId: daoProposalId(n),
            metaId: daoMetaId(),
            proposalType: 'governance',
            emergency: false,
            description: 'Past startTime rejection test',
            options: ['yes', 'no'],
            gracePeriod: graceDurationMs,
            governance: { changes: [{ key: 'pctBurned', value: '52', current: '50' }] },
            startTime: timestamp - 1,
            timestamp,
          },
          proposer2,
          'cannot be earlier',
        )
      },
    ],
    [
      '9.2  Create proposal with future startTime',
      async () => {
        sc9ProposalN = setProposalN('sc9', await createDaoProposal({
          proposer: proposer2,
          description: 'Future startTime scheduling test',
          changes: [{ key: 'pctBurned', value: '53', current: '50' }],
          gracePeriodMs: graceDurationMs,
          startTime: nowPlus(30_000),
        }))
        saveCurrentRunState()
        const proposal = await getProposal(sc9ProposalN)
        assert(proposal.creationTime < proposal.startTime, `Expected creationTime < startTime, got ${proposal.creationTime} >= ${proposal.startTime}`)
      },
    ],
    ],
    bodySteps: [
    [
      '9.3  Committee vote before startTime is rejected',
      async () => {
        await injectExpectReject(
          {
            type: 'dao_committee_vote',
            networkId: currentNetworkId,
            from: committee[0].address,
            proposalId: daoProposalId(sc9ProposalN),
            vote: 'accept',
            timestamp: Date.now(),
          },
          committee[0],
          'has not started',
        )
      },
    ],
    [
      '9.4  Committee vote succeeds after startTime while status remains review',
      async () => {
        const proposalBefore = await getProposal(sc9ProposalN)
        await sleepUntilTimestamp(proposalBefore.startTime, 'startTime', SLEEP_BUFFER_MS)
        await injectAndAssert(
          {
            type: 'dao_committee_vote',
            networkId: currentNetworkId,
            from: committee[0].address,
            proposalId: daoProposalId(sc9ProposalN),
            vote: 'accept',
            timestamp: Date.now(),
          },
          committee[0],
        )
        const proposal = await getProposal(sc9ProposalN)
        assert(proposal.status === 'review', `Expected proposal to remain review before reviewEnd, got ${proposal.status}`)
      },
    ],
    ],
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Scenario 10 — Committee vote-changing during review
  // ─────────────────────────────────────────────────────────────────────────
  const sc10: ScenarioDef = {
    num: 10,
    name: 'Scenario 10 — Committee vote changing during review',
    sequentialOnly: true,
    setupSteps: [
    [
      '10.1 Create proposal for committee vote switch',
      async () => {
        sc10ProposalN = setProposalN('sc10', await createDaoProposal({
          proposer: proposer3,
          description: 'Committee vote switch test',
          changes: [{ key: 'pctBurned', value: '54', current: '50' }],
          gracePeriodMs: graceDurationMs,
        }))
        saveCurrentRunState()
      },
    ],
    ],
    bodySteps: [
    [
      '10.2 Committee member switches accept → withhold',
      async () => {
        await injectAndAssert(
          { type: 'dao_committee_vote', networkId: currentNetworkId, from: committee[0].address, proposalId: daoProposalId(sc10ProposalN), vote: 'accept', timestamp: Date.now() },
          committee[0],
        )
        await injectAndAssert(
          {
            type: 'dao_committee_vote',
            networkId: currentNetworkId,
            from: committee[0].address,
            proposalId: daoProposalId(sc10ProposalN),
            vote: 'withhold',
            withheldReason: 'Need more analysis',
            timestamp: Date.now(),
          },
          committee[0],
        )
        const proposal = await getProposal(sc10ProposalN)
        const entries = proposal.committeeVotes.filter(v => v.memberAddress === committee[0].address)
        assert(entries.length === 1, `Expected one committeeVotes entry after switch, got ${entries.length}`)
        assert(entries[0].vote === 'withhold' && entries[0].withheldReason === 'Need more analysis', `Expected latest withhold vote, got ${JSON.stringify(entries[0])}`)
      },
    ],
    [
      '10.3 Final withhold tally becomes decisive',
      async () => {
        for (let i = 1; i <= 2; i++) {
          await injectAndAssert(
            {
              type: 'dao_committee_vote',
              networkId: currentNetworkId,
              from: committee[i].address,
              proposalId: daoProposalId(sc10ProposalN),
              vote: 'withhold',
              withheldReason: 'Committee withhold regression test',
              timestamp: Date.now(),
            },
            committee[i],
          )
        }
        const proposal = await getProposal(sc10ProposalN)
        assert(proposal.status === 'withheld', `Expected decisive final withhold status, got ${proposal.status}`)
      },
    ],
    ],
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Scenario 11 — Non-decisive / tied committee vote at reviewEnd
  // ─────────────────────────────────────────────────────────────────────────
  const sc11: ScenarioDef = {
    num: 11,
    name: 'Scenario 11 — Non-decisive committee split',
    sequentialOnly: true,
    setupSteps: [
    [
      '11.1 Create proposal for tied committee split',
      async () => {
        sc11ProposalN = setProposalN('sc11', await createDaoProposal({
          proposer: proposer2,
          description: 'Non-decisive committee split test',
          changes: [{ key: 'pctBurned', value: '56', current: '50' }],
          gracePeriodMs: graceDurationMs,
        }))
        saveCurrentRunState()
      },
    ],
    ],
    bodySteps: [
    [
      '11.2 Cast 2 accept and 2 withhold votes',
      async () => {
        for (const i of [0, 1]) {
          await injectAndAssert(
            { type: 'dao_committee_vote', networkId: currentNetworkId, from: committee[i].address, proposalId: daoProposalId(sc11ProposalN), vote: 'accept', timestamp: Date.now() },
            committee[i],
          )
        }
        for (const i of [2, 3]) {
          await injectAndAssert(
            {
              type: 'dao_committee_vote',
              networkId: currentNetworkId,
              from: committee[i].address,
              proposalId: daoProposalId(sc11ProposalN),
              vote: 'withhold',
              withheldReason: 'Tie regression test',
              timestamp: Date.now(),
            },
            committee[i],
          )
        }
        const proposal = await getProposal(sc11ProposalN)
        assert(proposal.status === 'review', `Expected non-decisive split to remain review, got ${proposal.status}`)
      },
    ],
    [
      '11.3 committee_result advances tied proposal to voting after reviewEnd',
      async () => {
        const proposalBefore = await getProposal(sc11ProposalN)
        await sleepUntilTimestamp(proposalBefore.reviewEnd, 'reviewEnd', SLEEP_BUFFER_MS)
        await injectAndAssert(
          { type: 'dao_committee_result', networkId: currentNetworkId, from: proposer2.address, proposalId: daoProposalId(sc11ProposalN), timestamp: Date.now() },
          proposer2,
        )
        const proposal = await getProposal(sc11ProposalN)
        assert(proposal.status === 'voting', `Expected tied proposal to advance to voting, got ${proposal.status}`)
      },
    ],
    ],
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Scenario 12 — Time-decay & spend-boost weight verification
  // ─────────────────────────────────────────────────────────────────────────
  const sc12: ScenarioDef = {
    num: 12,
    name: 'Scenario 12 — Time decay and spend boost',
    sequentialOnly: true,
    setupSteps: [
    [
      '12.1 Create proposal for time-decay/spend-boost checks',
      async () => {
        sc12ProposalN = setProposalN('sc12', await createDaoProposal({
          proposer: proposer3,
          description: 'Time decay and spend boost test',
          changes: [{ key: 'pctBurned', value: '57', current: '50' }],
          gracePeriodMs: graceDurationMs,
        }))
        saveCurrentRunState()
      },
    ],
    ],
    bodySteps: [
    [
      '12.2 Advance proposal to voting',
      async () => {
        await committeeAcceptToVoting(sc12ProposalN, proposer3, committee, SLEEP_BUFFER_MS)
      },
    ],
    [
      '12.3 Early/min, early/high, and late/min votes show expected relative weights',
      async () => {
        const earlyMin = await castVote(sc12ProposalN, voter1, [1, 0], minVoteSpendLib)
        const earlyHigh = await castVote(sc12ProposalN, voter2, [1, 0], minVoteSpendLib * 3)
        const proposalBeforeLate = await getProposal(sc12ProposalN)
        await sleepUntilTimestamp(proposalBeforeLate.votingStart + Math.floor(proposalBeforeLate.votingDuration * 0.75), 'late second-half vote point', SLEEP_BUFFER_MS)
        const lateMin = await castVote(sc12ProposalN, voter3, [1, 0], minVoteSpendLib)
        const earlyMinWeight = asBigInt(earlyMin.receipt.additionalInfo.optionWeights[0])
        const earlyHighWeight = asBigInt(earlyHigh.receipt.additionalInfo.optionWeights[0])
        const lateMinWeight = asBigInt(lateMin.receipt.additionalInfo.optionWeights[0])
        assert(lateMinWeight < earlyMinWeight, `Expected late min vote ${lateMinWeight} < early min vote ${earlyMinWeight}`)
        assert(earlyHighWeight > earlyMinWeight * 3n, `Expected spend boost to be disproportionate: high=${earlyHighWeight}, min=${earlyMinWeight}`)
      },
    ],
    ],
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Scenario 13 — Targeted validation/rejection sweep
  // ─────────────────────────────────────────────────────────────────────────
  const sc13: ScenarioDef = {
    num: 13,
    name: 'Scenario 13 — Targeted validation/rejection sweep',
    sequentialOnly: true,
    setupSteps: [
    [
      '13.1 Create live voting proposal for rejection checks',
      async () => {
        sc13ProposalN = setProposalN('sc13', await createDaoProposal({
          proposer,
          description: 'Validation sweep proposal',
          changes: [{ key: 'pctBurned', value: '58', current: '50' }],
          gracePeriodMs: graceDurationMs,
        }))
        saveCurrentRunState()
      },
    ],
    ],
    bodySteps: [
    [
      '13.2 Advance proposal to voting',
      async () => {
        await committeeAcceptToVoting(sc13ProposalN, proposer, committee, SLEEP_BUFFER_MS)
      },
    ],
    [
      '13.3 dao_vote validation failures are rejected',
      async () => {
        const voter4Balance = await getBalance(voter4.address)
        assert(voter4Balance !== null, `Expected voter4 account to exist before overspend validation`)
        const cases = [
          { name: 'length mismatch', weights: [1, 0, 0], spend: libToWei(minVoteSpendLib), reason: 'length' },
          { name: 'all zero', weights: [0, 0], spend: libToWei(minVoteSpendLib), reason: 'positive weight' },
          { name: 'negative weight', weights: [1, -1], spend: libToWei(minVoteSpendLib), reason: undefined },
          { name: 'below minimum spend', weights: [1, 0], spend: 1n, reason: 'minimum required' },
          { name: 'spend upper bound', weights: [1, 0], spend: voter4Balance + 1n, reason: 'exceeds account balance' },
        ]
        for (const c of cases) {
          const rejected = await injectExpectReject(
            {
              type: 'dao_vote',
              networkId: currentNetworkId,
              from: voter4.address,
              proposalId: daoProposalId(sc13ProposalN),
              weights: c.weights,
              spend: c.spend,
              timestamp: Date.now(),
            },
            voter4,
            c.reason,
          )
          if (rejected.receipt) {
            assertReceiptTargetsProposal(rejected.receipt, sc13ProposalN)
            assertFailedReceiptCharged(rejected.receipt)
          }
        }
      },
    ],
    [
      '13.4 Accepted proposal still rejects apply before grace period',
      async () => {
        await castVote(sc13ProposalN, voter5, [1, 0], minVoteSpendLib)
        await finalizeVote(sc13ProposalN, proposer, SLEEP_BUFFER_MS)
        const changesBefore = await getProposalListOfChanges()
        const beforeGrace = await injectExpectRejectOrNoReceipt(
          { type: 'dao_apply_parameters', networkId: currentNetworkId, from: proposer.address, proposalId: daoProposalId(sc13ProposalN), timestamp: Date.now() },
          proposer,
          'Grace period',
        )
        if (beforeGrace.receipt) {
          assertReceiptTargetsProposal(beforeGrace.receipt, sc13ProposalN)
          assertFailedReceiptCharged(beforeGrace.receipt)
        }
        const proposalAfter = await getProposal(sc13ProposalN)
        const changesAfter = await getProposalListOfChanges()
        assert(proposalAfter.status === 'accepted', `Early apply attempt changed proposal status to ${proposalAfter.status}`)
        assert(changesAfter.length === changesBefore.length, 'Early apply attempt unexpectedly queued a network change')
      },
    ],
    [
      '13.5 claim/proposal/API validation failures are rejected',
      async () => {
        const badStartN = await nextProposalNumber()
        await injectExpectReject(
          {
            type: 'dao_proposal_create',
            networkId: currentNetworkId,
            from: proposer.address,
            proposalId: daoProposalId(badStartN),
            metaId: daoMetaId(),
            proposalType: 'governance',
            emergency: false,
            description: 'Too many options rejection',
            options: ['yes', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10'],
            gracePeriod: graceDurationMs,
            governance: { changes: [{ key: 'pctBurned', value: '59', current: '50' }] },
            timestamp: Date.now(),
          },
          proposer,
        )

        const badStatus = await apiGet('/dao/proposals?status=bogus', { validateStatus: () => true })
        assert(badStatus.status === 400, `Expected invalid status filter HTTP 400, got ${badStatus.status}`)
      },
    ],
    ],
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Run scenarios — sequential (default) or parallel (--parallel flag)
  // ─────────────────────────────────────────────────────────────────────────
  const scenarios = [sc1, sc2, sc3, sc4, sc5, sc6, sc7, sc8, sc9, sc10, sc11, sc12, sc13]
  if (PARALLEL) {
    await runScenariosParallel(scenarios)
  } else {
    for (const def of scenarios) {
      await scenario(def)
    }
  }

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
  for (const r of [...results].sort(compareStepResults)) {
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
