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
 * Output lines are prefixed with [S1]…[S17] to distinguish interleaved scenarios.
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
import { AsyncLocalStorage } from 'async_hooks'
import execa from 'execa'
import { ethers } from 'ethers'
import fs from 'fs'
import * as net from 'net'
import path from 'path'
import * as ShardusCrypto from '@shardus/lib-crypto-utils'
import { Utils } from '@shardus/lib-types'
import { DaoProposalAccount } from '../src/@types'
import { computeClaimReward } from '../src/utils/daoClaimRewardMath'
import { getReviewEnd, getVotingStart, getVotingEnd, getClaimEnd, getApplyEligibleAt } from '../src/accounts/daoProposalAccount'

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
const ALLOWED_FLAGS = new Set(['--verbose', '--stop', '--no-stop', '--no-start', '--parallel', '--scenario', '--step'])
const FLAGS_WITH_VALUES = new Set(['--scenario', '--step'])

function readFlagValue(flag: string): string | null {
  const idx = cliArgs.indexOf(flag)
  if (idx === -1) return null
  const value = cliArgs[idx + 1]
  if (!value || value.startsWith('--')) throw new Error(`${flag} requires a value`)
  return value
}

function parseCommaList(value: string, label: string): string[] {
  const parts = value.split(',').map(s => s.trim())
  if (parts.length === 0 || parts.some(s => s.length === 0)) throw new Error(`Malformed ${label} filter: "${value}"`)
  return parts
}

/** Bumped whenever a new scenario is added — keeps --scenario and --step validation in sync. */
const MAX_SCENARIO_NUMBER = 17

function parseScenarioFilter(value: string | null): Set<number> | null {
  if (value == null) return null
  const scenarios = new Set<number>()
  for (const raw of parseCommaList(value, '--scenario')) {
    if (!/^\d+$/.test(raw)) throw new Error(`Invalid scenario "${raw}"`)
    const scenarioNumber = Number(raw)
    if (scenarioNumber < 1 || scenarioNumber > MAX_SCENARIO_NUMBER) throw new Error(`Scenario ${scenarioNumber} is outside the supported range 1-${MAX_SCENARIO_NUMBER}`)
    scenarios.add(scenarioNumber)
  }
  return scenarios
}

function parseStepFilter(value: string | null): Set<string> | null {
  if (value == null) return null
  const steps = new Set<string>()
  for (const raw of parseCommaList(value, '--step')) {
    if (!/^\d+\.\d+[a-z]*$/i.test(raw)) throw new Error(`Invalid step id "${raw}"`)
    const scenarioNumber = Number(raw.split('.')[0])
    if (scenarioNumber < 1 || scenarioNumber > MAX_SCENARIO_NUMBER) throw new Error(`Step ${raw} references unsupported scenario ${scenarioNumber}`)
    steps.add(raw)
  }
  return steps
}

function validateCliArgs(): void {
  for (let i = 0; i < cliArgs.length; i++) {
    const arg = cliArgs[i]
    if (!arg.startsWith('--')) throw new Error(`Unexpected positional argument "${arg}"`)
    if (!ALLOWED_FLAGS.has(arg)) throw new Error(`Unknown flag "${arg}"`)
    if (FLAGS_WITH_VALUES.has(arg)) {
      if (i + 1 >= cliArgs.length || cliArgs[i + 1].startsWith('--')) throw new Error(`${arg} requires a value`)
      i++
    }
  }
  if (cliArgs.includes('--stop') && cliArgs.includes('--no-stop')) throw new Error('Use either --stop or --no-stop, not both')
  if (cliArgs.includes('--parallel') && cliArgs.includes('--step')) throw new Error('--parallel cannot be combined with --step')
}

validateCliArgs()

const VERBOSE = cliArgs.includes('--verbose')
const FORCE_STOP = cliArgs.includes('--stop')
const NO_STOP = cliArgs.includes('--no-stop') // legacy alias: always keep network up

/**
 * --scenario 1,3,5  — set of scenario numbers to run (default: all)
 * null means no filter (run all).
 */
const SCENARIO_FILTER: Set<number> | null = (() => {
  return parseScenarioFilter(readFlagValue('--scenario'))
})()

/**
 * --step 1.8,1.9  — set of step IDs to run (default: all).
 * Step ID is the leading token of the step name, e.g. "1.8".
 * When set, only the matching steps execute; all others are skipped.
 * Automatically implies --no-start and derives SCENARIO_FILTER from the step numbers.
 */
const STEP_FILTER: Set<string> | null = (() => {
  return parseStepFilter(readFlagValue('--step'))
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
const summaryFile = path.join(logDir, `dao-e2e-summary-${logStamp}.json`)
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

function writeSummary(status: 'pass' | 'fail' | 'fatal' | 'interrupted', error?: unknown): void {
  const passed = results.filter(r => r.status === 'pass').length
  const failed = results.filter(r => r.status === 'fail').length
  const skipped = results.filter(r => r.status === 'skip').length
  const cumulativeStepMs = results.reduce((sum, r) => sum + r.ms, 0)
  const summary = {
    status,
    error: error instanceof Error ? error.message : error == null ? undefined : String(error),
    args: cliArgs,
    networkId: currentNetworkId,
    mode: PARALLEL ? 'parallel' : 'sequential',
    logFile,
    terminalLogFile,
    timing: {
      startedAt: new Date(runStartedAt).toISOString(),
      finishedAt: new Date().toISOString(),
      wallMs: Date.now() - runStartedAt,
      cumulativeStepMs,
    },
    totals: {
      passed,
      failed,
      skipped,
      total: results.length,
    },
    scenarios: [...scenarioTimings].sort((a, b) => a.num - b.num),
    steps: [...results].sort(compareStepResults),
  }
  try {
    fs.writeFileSync(summaryFile, JSON.stringify(summary, null, 2))
  } catch (err) {
    console.warn(`Warning: failed to save summary to ${summaryFile}: ${err}`)
  }
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
    writeSummary('interrupted', signal)
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
  const tmpPath = `${RUN_STATE_PATH}.${process.pid}.tmp`
  try {
    fs.writeFileSync(tmpPath, JSON.stringify(state, null, 2), { mode: 0o600 })
    fs.renameSync(tmpPath, RUN_STATE_PATH)
  } catch (err) {
    try {
      if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath)
    } catch {
      /* best effort */
    }
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

interface ScenarioTiming {
  num: number
  name: string
  ms: number
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
  /** Steps in this scenario's body are independent and may run concurrently in --parallel mode. */
  parallelBodySteps?: boolean
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
const scenarioTimings: ScenarioTiming[] = []
const scenarioStarts = new Map<number, number>()
const runStartedAt = Date.now()

/**
 * Network ID from the cycle record — set once the network reaches 'processing'
 * mode and included in every TX to pass isValidNetworkId().
 */
let currentNetworkId = ''

/** Max wait for a queued TX to produce a receipt or for a proposal account to appear. */
let txSettleTimeoutMs = 45_000

function startScenarioTimer(def: ScenarioDef): void {
  if (!scenarioStarts.has(def.num)) scenarioStarts.set(def.num, Date.now())
}

function finishScenarioTimer(def: ScenarioDef): void {
  const startedAt = scenarioStarts.get(def.num)
  if (startedAt == null || scenarioTimings.some(timing => timing.num === def.num)) return
  scenarioTimings.push({ num: def.num, name: def.name, ms: Date.now() - startedAt })
}

/**
 * Per-sender queue used only by the test harness. In parallel mode several scenarios can
 * submit TXs from the same committee/proposer/voter account at once; serializing by sender
 * avoids account-lock/cant_preApply contention while preserving concurrency for different
 * accounts.
 */
const senderLocks = new Map<string, Promise<void>>()
let proposalCreateLock: Promise<void> = Promise.resolve()

async function withSenderLock<T>(sender: string, fn: () => Promise<T>): Promise<T> {
  const previous = senderLocks.get(sender) ?? Promise.resolve()
  let release!: () => void
  const blocker = new Promise<void>(resolve => {
    release = resolve
  })
  const next = previous.catch(() => undefined).then(() => blocker)
  senderLocks.set(sender, next)

  await previous.catch(() => undefined)
  try {
    return await fn()
  } finally {
    release()
    if (senderLocks.get(sender) === next) senderLocks.delete(sender)
  }
}

async function withProposalCreateLock<T>(fn: () => Promise<T>): Promise<T> {
  const previous = proposalCreateLock
  let release!: () => void
  proposalCreateLock = new Promise<void>(resolve => {
    release = resolve
  })

  await previous.catch(() => undefined)
  try {
    return await fn()
  } finally {
    release()
  }
}

// ─── Assertion ───────────────────────────────────────────────────────────────

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

function refreshTxTimestamp<T extends object>(tx: T): void {
  const timestampedTx = tx as { timestamp?: number }
  timestampedTx.timestamp = Date.now()
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

interface StepLogContext {
  stepId: string
  scenario: number
}

const stepLogContext = new AsyncLocalStorage<StepLogContext>()

function stepIdFromName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? '-'
}

function stepLogPrefix(): string {
  const ctx = stepLogContext.getStore()
  if (!ctx) return '[no-step]'
  return `[S${ctx.scenario} ${ctx.stepId}]`
}

function verboseStepLog(...args: unknown[]): void {
  if (!VERBOSE) return
  console.log(`  ${stepLogPrefix()}`, ...args)
}

// ─── Step / Scenario runner ───────────────────────────────────────────────────

async function step(name: string, fn: () => Promise<void>, prefix = ''): Promise<void> {
  const start = Date.now()
  const key = stepSortKey(name)
  const context = {
    stepId: stepIdFromName(name),
    scenario: key.scenario,
  }
  try {
    await stepLogContext.run(context, fn)
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

  startScenarioTimer(def)
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
  finishScenarioTimer(def)
}

/**
 * Run the body steps of a single scenario (used in parallel mode).
 * prefix is printed before each step result, e.g. "[S1]".
 */
async function runScenarioBody(def: ScenarioDef, prefix: string): Promise<void> {
  startScenarioTimer(def)
  console.log(`\n${prefix} ── ${def.name} ──`)
  if (def.parallelBodySteps) {
    try {
      await Promise.allSettled(
        def.bodySteps.map(async ([stepName, fn]) => {
          const stepId = stepName.trim().split(/\s+/)[0]
          const stepFiltered = STEP_FILTER && !STEP_FILTER.has(stepId)
          if (stepFiltered) {
            results.push({ name: stepName, status: 'skip', ms: 0 })
            console.log(`${prefix}  ⏭   ${stepName} (skipped — not in --step filter)`)
            return
          }
          await step(stepName, fn, prefix)
        }),
      )
    } finally {
      finishScenarioTimer(def)
    }
    return
  }

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
  finishScenarioTimer(def)
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
    startScenarioTimer(def)
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
        await step(stepName, fn, `[S${def.num}]`)
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
    finishScenarioTimer(def)
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

function validateScenarioCatalog(defs: ScenarioDef[]): void {
  if (SCENARIO_FILTER) {
    const available = new Set(defs.map(def => def.num))
    for (const scenarioNumber of SCENARIO_FILTER) {
      if (!available.has(scenarioNumber)) throw new Error(`No scenario ${scenarioNumber} exists in the DAO E2E catalog`)
    }
  }
  if (STEP_FILTER) {
    const availableSteps = new Set<string>()
    for (const def of defs) {
      for (const [name] of [...def.setupSteps, ...def.bodySteps]) availableSteps.add(stepIdFromName(name))
    }
    const missing = [...STEP_FILTER].filter(stepId => !availableSteps.has(stepId))
    if (missing.length > 0) throw new Error(`No DAO E2E step matches: ${missing.join(', ')}`)
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

/** Convert a USD string to whole LIB (ceil), matching server USD-to-LIB conversion. */
function usdStrToLibCeil(usdStr: string, stabilityFactorStr: string): number {
  const stabilityWei = ethers.parseEther(stabilityFactorStr)
  const usdWei = ethers.parseEther(usdStr)
  const libWei = (usdWei * 10n ** 18n) / stabilityWei
  return Math.ceil(Number(ethers.formatEther(libWei)))
}

/** Convert a USD string to LIB wei using the network stability factor. */
function usdStrToLibWei(usdStr: string, stabilityFactorStr: string): bigint {
  return ethers.parseEther(usdStr) * 10n ** 18n / ethers.parseEther(stabilityFactorStr)
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
  from?: string
  to?: string
  transactionFee?: bigint | string | number | { dataType?: string; value?: string }
  additionalInfo?: any
}

interface InjectAssertOptions {
  expectedBalanceDelta?: (receipt: TxReceipt) => bigint
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
        const hosts = await getActiveHosts()
        const results = await Promise.allSettled(
          hosts.map(async host => {
            const res = await axios.get(`http://${host}/transaction/${txId}`)
            const tx = res.data?.transaction
            return tx && typeof tx.success === 'boolean' ? (tx as TxReceipt) : null
          }),
        )
        for (const result of results) {
          if (result.status === 'fulfilled' && result.value) {
            receipt = result.value
            return true
          }
        }
        return false
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
 * Sign, inject, wait for receipt, and assert apply succeeded.
 * Posts { tx: Utils.safeStringify(tx) } — /inject reads req.body.tx via safeJsonParse.
 */
async function injectAndAssert<T extends object>(tx: T, account: TestAccount, opts: InjectAssertOptions = {}): Promise<any> {
  return withSenderLock(account.address, async () => {
    const balanceBefore = opts.expectedBalanceDelta ? await getBalance(account.address) : null
    if (opts.expectedBalanceDelta) assert(balanceBefore !== null, `Expected ${account.address} to exist before balance-delta assertion`)
    refreshTxTimestamp(tx)
    await signTx(tx, account)
    verboseStepLog('→ TX:', Utils.safeStringify(tx))
    let res: any
    try {
      res = await apiPost('/inject', { tx: Utils.safeStringify(tx) })
    } catch (err: any) {
      if (err.response) throw new Error(`HTTP ${err.response.status}: ${JSON.stringify(err.response.data)}`)
      throw err
    }
    verboseStepLog('← Inject:', JSON.stringify(res.data))
    assert(res.data.result?.success === true, `TX rejected at inject: ${JSON.stringify(res.data)}`)
    const txId: string = res.data.result.txId
    assert(typeof txId === 'string' && txId.length > 0, `Inject succeeded but no txId returned`)

    const receipt = await waitForTxReceipt(txId)
    verboseStepLog('← Receipt:', JSON.stringify(receipt))
    assert(receipt.txId === txId, `Receipt txId mismatch: expected ${txId}, got ${receipt.txId}`)
    assert(receipt.type === (tx as any).type, `Receipt type mismatch: expected ${(tx as any).type}, got ${receipt.type}`)
    if (receipt.from != null) assert(receipt.from === account.address, `Receipt from mismatch: expected ${account.address}, got ${receipt.from}`)
    if (receipt.transactionFee != null) assert(asBigInt(receipt.transactionFee) >= 0n, `Receipt transactionFee was negative: ${receipt.transactionFee}`)
    assert(receipt.success === true, `TX failed at apply: ${JSON.stringify(receipt)}`)
    if (opts.expectedBalanceDelta) {
      const balanceAfter = await getBalance(account.address)
      assert(balanceAfter !== null, `Expected ${account.address} to exist after balance-delta assertion`)
      const expectedAfter = balanceBefore! + opts.expectedBalanceDelta(receipt)
      assert(balanceAfter === expectedAfter, `Unexpected balance delta for ${(tx as any).type}: expected ${expectedAfter}, got ${balanceAfter}`)
    }
    return { ...res.data, receipt }
  })
}

/**
 * Sign and inject a DAO TX expected to be rejected before queue admission.
 */
async function injectExpectReject<T extends object>(
  tx: T,
  account: TestAccount,
  reasonIncludes?: string,
): Promise<{ reason: string; result: any }> {
  return withSenderLock(account.address, async () => {
    const balanceBefore = await getBalance(account.address)
    assert(balanceBefore !== null, `Expected ${account.address} to exist before rejected DAO transaction`)
    refreshTxTimestamp(tx)
    await signTx(tx, account)
    verboseStepLog('→ TX (expect reject):', Utils.safeStringify(tx))
    let result: any
    try {
      const res = await apiPost('/inject', { tx: Utils.safeStringify(tx) })
      verboseStepLog('← Inject:', JSON.stringify(res.data))
      result = res.data?.result
    } catch (err: any) {
      if (err.response) {
        verboseStepLog('← Inject (HTTP error):', JSON.stringify(err.response.data))
        result = err.response.data?.result ?? err.response.data
      } else {
        throw err
      }
    }

    assert(result?.success !== true, `Expected TX to be rejected during injection, got: ${JSON.stringify(result)}`)
    assert(!result?.txId, `Pre-crack rejection unexpectedly returned txId ${result.txId}`)
    const reason = result?.reason ?? ''

    if (reasonIncludes) {
      assert(
        reason.toLowerCase().includes(reasonIncludes.toLowerCase()),
        `Expected rejection reason to include "${reasonIncludes}", got: "${reason}"`,
      )
    }
    const balanceAfter = await getBalance(account.address)
    assert(balanceAfter !== null, `Expected ${account.address} to exist after rejected DAO transaction`)
    assert(balanceAfter === balanceBefore, `Pre-crack rejection charged a fee: balance changed from ${balanceBefore} to ${balanceAfter}`)
    return { reason, result }
  })
}

/**
 * DaoProposalAccount only stores `creationTime`/`startTime` — every other phase-boundary
 * timestamp is derived from those plus the duration snapshots. Clients compute these locally;
 * the API returns raw proposal data only.
 */
type DaoProposalWithTiming = DaoProposalAccount & {
  reviewEnd: number
  votingStart: number
  votingEnd: number
  claimEnd: number
  applyEligibleAt: number
}

function addDerivedTiming(proposal: DaoProposalAccount): DaoProposalWithTiming {
  return {
    ...proposal,
    reviewEnd: getReviewEnd(proposal),
    votingStart: getVotingStart(proposal),
    votingEnd: getVotingEnd(proposal),
    claimEnd: getClaimEnd(proposal),
    applyEligibleAt: getApplyEligibleAt(proposal),
  }
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
          proposal = addDerivedTiming(body.proposal as DaoProposalAccount)
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

function archiverActiveVersionFromProposal(proposal: DaoProposalAccount): string | null {
  const change = proposal.economic?.changes?.find(c => c.key === 'archiver')
  if (!change) return null
  const value = safeParse(change.value)
  return value?.activeVersion == null ? null : String(value.activeVersion)
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

/**
 * Query the live daoUnapplyCommitteeThreshold and clamp it the same way
 * dao_unapply_parameters.apply() does, so the scenario stays correct even if the flag was
 * changed via /debug-set-liberdus-flag before a --no-start rerun.
 */
async function getEffectiveUnapplyThreshold(committeeSize: number): Promise<number> {
  const res = await apiGet('/debug-liberdus-flags')
  const configured = safeParse(res.data)?.LiberdusFlags?.daoUnapplyCommitteeThreshold
  const base = Number.isSafeInteger(configured) && configured > 0 ? configured : 3
  return Math.min(base, committeeSize)
}

async function getProposalListOfChanges(): Promise<any[]> {
  return (await getNetworkParameters())?.listOfChanges ?? []
}

async function getCurrentNetworkValue(key: string): Promise<unknown> {
  return (await getNetworkParameters())?.current?.[key]
}

function getPathValue(value: any, path: string[]): unknown {
  return path.reduce((current, key) => current?.[key], value)
}

async function waitForNetworkParameter(path: string[], expected: unknown, timeoutMs: number): Promise<void> {
  let lastValue: unknown
  try {
    await pollUntil(async () => {
      const parameters = await getNetworkParameters()
      lastValue = getPathValue(parameters, path)
      return String(lastValue) === String(expected)
    }, timeoutMs)
  } catch {
    throw new Error(
      `Timed out waiting for /network/parameters.${path.join('.')} === ${JSON.stringify(expected)}; last value was ${JSON.stringify(lastValue)}`,
    )
  }
}

async function waitForListOfChanges(description: string, matches: (change: any) => boolean, timeoutMs: number): Promise<void> {
  let lastChanges: any[] = []
  try {
    await pollUntil(async () => {
      lastChanges = await getProposalListOfChanges()
      return lastChanges.some(matches)
    }, timeoutMs)
  } catch {
    throw new Error(`Timed out waiting for listOfChanges to contain ${description}; last listOfChanges was ${JSON.stringify(lastChanges)}`)
  }
}

async function waitForListOfChangesFromReceipt(description: string, receipt: TxReceipt, matches: (change: any) => boolean, timeoutMs: number): Promise<void> {
  const receiptChange = receipt.additionalInfo?.change
  const expectedCycle = receiptChange?.cycle
  assert(expectedCycle != null, `dao_apply_parameters receipt missing additionalInfo.change.cycle for ${description}: ${JSON.stringify(receipt.additionalInfo)}`)
  await waitForListOfChanges(
    `${description} at cycle ${expectedCycle}`,
    change => String(change?.cycle) === String(expectedCycle) && matches(change),
    timeoutMs,
  )
}

type ProposalType = 'governance' | 'economic' | 'protocol'

interface ProposalCreateOptions {
  proposer: TestAccount
  proposalType?: ProposalType
  emergency?: boolean
  title: string
  description: string
  options?: string[]
  changes: Array<{ key: string; value: string; current: string }>
  gracePeriodMs: number
  startTime?: number
  expectedBalanceDelta?: (receipt: TxReceipt) => bigint
}

function proposalPayloadKey(type: ProposalType): 'governance' | 'economic' | 'protocol' {
  return type
}

async function createDaoProposal(opts: ProposalCreateOptions): Promise<number> {
  return withProposalCreateLock(async () => {
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
      title: opts.title,
      description: opts.description,
      options: opts.options ?? ['yes', 'no'],
      gracePeriod: opts.gracePeriodMs,
      [proposalPayloadKey(proposalType)]: { changes: opts.changes },
      timestamp: Date.now(),
    }
    if (opts.startTime !== undefined) tx.startTime = opts.startTime
    await injectAndAssert(tx, opts.proposer, { expectedBalanceDelta: opts.expectedBalanceDelta })
    return proposalNumber
  })
}

async function expectProposalCreateReject(
  buildTx: (proposalNumber: number) => any,
  account: TestAccount,
  reasonIncludes?: string,
): Promise<void> {
  await withProposalCreateLock(async () => {
    const proposalNumber = await nextProposalNumber()
    await injectExpectReject(buildTx(proposalNumber), account, reasonIncludes)
  })
}

async function committeeAcceptToVoting(
  proposalNumber: number,
  actor: TestAccount,
  committee: TestAccount[],
  sleepBufferMs: number,
  committeeIndexes: number[] = [0, 1, 2],
): Promise<void> {
  for (const i of committeeIndexes) {
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

async function castVote(
  proposalNumber: number,
  voter: TestAccount,
  weights: number[],
  spendLib: number,
  expectedBalanceDelta?: (receipt: TxReceipt) => bigint,
): Promise<any> {
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
    { expectedBalanceDelta },
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
  // dao_apply_parameters.validate() skips the applyEligibleAt check entirely for emergency
  // proposals (no grace period) — only regular proposals need to wait for it here.
  if (!proposalBeforeApply.emergency) {
    await sleepUntilTimestamp(proposalBeforeApply.applyEligibleAt, 'applyEligibleAt', sleepBufferMs)
  }
  const result = await injectAndAssert(
    {
      type: 'dao_apply_parameters',
      networkId: currentNetworkId,
      from: actor.address,
      proposalId: daoProposalId(proposalNumber),
      timestamp: Date.now(),
    },
    actor,
  )
  const proposal = await getProposal(proposalNumber)
  assert(proposal.status === 'applied', `Expected proposal #${proposalNumber} status 'applied', got '${proposal.status}'`)
  return result
}

function assertDerivedTimingAndSnapshots(proposal: DaoProposalWithTiming, daoParams: any): void {
  // Verify the proposal snapshotted the network's duration params correctly at creation time.
  // The derived timing fields (reviewEnd, votingEnd, etc.) are computed locally by addDerivedTiming
  // from these snapshots, so checking the snapshots themselves is the meaningful assertion.
  assert(proposal.reviewDuration === daoParams.reviewDuration, `reviewDuration snapshot mismatch: ${proposal.reviewDuration} vs daoParams ${daoParams.reviewDuration}`)
  assert(proposal.votingDuration === daoParams.votingDuration, `votingDuration snapshot mismatch: ${proposal.votingDuration} vs daoParams ${daoParams.votingDuration}`)
  assert(proposal.claimDuration === daoParams.claimDuration, `claimDuration snapshot mismatch: ${proposal.claimDuration} vs daoParams ${daoParams.claimDuration}`)
  assert(proposal.graceDuration === daoParams.graceDuration, `graceDuration snapshot mismatch: ${proposal.graceDuration} vs daoParams ${daoParams.graceDuration}`)
  assert(proposal.proposalFeeUsdStr === daoParams.proposalFeeUsdStr, `proposalFeeUsdStr snapshot mismatch: ${proposal.proposalFeeUsdStr} vs ${daoParams.proposalFeeUsdStr}`)
  assert(proposal.voteThresholdUsdStr === daoParams.voteThresholdUsdStr, `voteThresholdUsdStr snapshot mismatch: ${proposal.voteThresholdUsdStr} vs ${daoParams.voteThresholdUsdStr}`)
  assert(proposal.minimumSpendUsdStr === daoParams.minimumSpendUsdStr, `minimumSpendUsdStr snapshot mismatch: ${proposal.minimumSpendUsdStr} vs ${daoParams.minimumSpendUsdStr}`)
  assert(proposal.voteExponent === daoParams.voteExponent, `voteExponent snapshot mismatch: ${proposal.voteExponent} vs ${daoParams.voteExponent}`)
  assert(proposal.pctBurned === daoParams.pctBurned, `pctBurned snapshot mismatch: ${proposal.pctBurned} vs ${daoParams.pctBurned}`)
  assert(
    JSON.stringify(proposal.committeeAddresses) === JSON.stringify(daoParams.committeeAddresses),
    `committeeAddresses snapshot mismatch`,
  )
}

function computeExpectedClaimReward(proposal: DaoProposalWithTiming, voterAddress: string, claimedSoFar: bigint): bigint {
  const voterIndex = proposal.voterList.findIndex(v => v.address === voterAddress)
  assert(voterIndex !== -1, `${voterAddress} not found in proposal.voterList`)
  const voterEntry = proposal.voterList[voterIndex]
  const previousTimestamp = voterIndex === 0 ? proposal.votingStart : proposal.voterList[voterIndex - 1].timestamp
  let timeDelta = BigInt(voterEntry.timestamp - previousTimestamp)
  if (timeDelta < 0n) timeDelta = 0n
  const reward = computeClaimReward(
    asBigInt(proposal.voterRewardPool),
    timeDelta,
    BigInt(proposal.votingDuration),
    BigInt(proposal.voterList.length),
  )
  const remainingPool = asBigInt(proposal.voterRewardPool) - claimedSoFar
  return reward > remainingPool ? remainingPool : reward
}

/**
 * Claim rewards in voterList order and assert the exact server formula.
 *
 * dao_claim_reward is time-weighted:
 *   previousTimestamp = first voter ? votingStart : prior voter's timestamp
 *   timeDelta         = voterEntry.timestamp - previousTimestamp
 *   reward            = voterRewardPool * (timeDelta/votingDuration/2 + 1/voterCount/2)
 *
 * Equal spend does not imply near-equal rewards. The gap between each voter and the previous
 * voter is part of the payout, so tests must compare against the formula rather than a rough
 * equality tolerance.
 */
async function claimAndAssertRewards(proposalNumber: number, claimers: TestAccount[]): Promise<bigint> {
  const proposalForReward = await getProposal(proposalNumber)
  let claimedSoFar = 0n
  for (const claimant of claimers) {
    const expectedReward = computeExpectedClaimReward(proposalForReward, claimant.address, claimedSoFar)
    const { receipt } = await injectAndAssert(
      {
        type: 'dao_claim_reward',
        networkId: currentNetworkId,
        from: claimant.address,
        proposalId: daoProposalId(proposalNumber),
        timestamp: Date.now(),
      },
      claimant,
      { expectedBalanceDelta: receipt => asBigInt(receipt.additionalInfo.reward) - asBigInt(receipt.transactionFee ?? 0n) },
    )
    const actualReward = asBigInt(receipt.additionalInfo.reward)
    assert(actualReward > 0n, `${claimant.address} received a zero reward`)
    assert(actualReward === expectedReward, `Expected ${claimant.address} reward ${expectedReward}, got ${actualReward}`)
    claimedSoFar += actualReward
  }
  return claimedSoFar
}

type BurnExpectation = bigint | 'zero' | 'positive'

function assertBurnFields(proposal: DaoProposalWithTiming, expected: { initial?: BurnExpectation; final?: BurnExpectation }): void {
  const check = (label: string, actual: bigint, wanted: BurnExpectation): void => {
    if (wanted === 'zero') {
      assert(actual === 0n, `Expected ${label} === 0n, got ${actual}`)
    } else if (wanted === 'positive') {
      assert(actual > 0n, `Expected ${label} > 0n, got ${actual}`)
    } else {
      assert(actual === wanted, `Expected ${label} === ${wanted}, got ${actual}`)
    }
  }
  if (expected.initial !== undefined) check('initialBurnedReward', asBigInt(proposal.initialBurnedReward), expected.initial)
  if (expected.final !== undefined) check('finalBurnedReward', asBigInt(proposal.finalBurnedReward), expected.final)
}

async function expectPreCrackRejectNoGlobalChange(
  tx: any,
  account: TestAccount,
  reasonIncludes: string,
  proposalNumber: number,
  changeMatcher: (change: any) => boolean,
): Promise<void> {
  const proposalBefore = await getProposal(proposalNumber)
  await injectExpectReject(tx, account, reasonIncludes)
  const proposalAfter = await getProposal(proposalNumber)
  assert(proposalAfter.status === proposalBefore.status, `Rejected apply changed proposal status from ${proposalBefore.status} to ${proposalAfter.status}`)
  const changesAfter = await getProposalListOfChanges()
  assert(!changesAfter.some(changeMatcher), 'Rejected apply unexpectedly queued a matching global change')
}

/** Inject a 'create' TX to fund an account and wait for apply receipt. */
async function fundAccount(account: TestAccount, amountLib: number): Promise<void> {
  return withSenderLock(account.address, async () => {
    const tx: any = {
      type: 'create',
      networkId: currentNetworkId,
      from: account.address,
      amount: libToWei(amountLib),
      timestamp: Date.now(),
    }
    await signTx(tx, account)
    verboseStepLog(`→ Fund TX (${amountLib} LIB):`, Utils.safeStringify(tx))
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
    verboseStepLog('← Fund receipt:', JSON.stringify(receipt))
    assert(receipt.success === true, `Fund TX failed at apply: ${JSON.stringify(receipt)}`)
  })
}

// ─── Network management ───────────────────────────────────────────────────────

/**
 * Fetch the active node list from the archiver and return one node's host:port,
 * replacing the previously hardcoded localhost:9001.
 */
async function pickActiveHost(): Promise<string> {
  const hosts = await getActiveHosts()
  return hosts[Math.floor(Math.random() * hosts.length)]
}

async function getActiveHosts(): Promise<string[]> {
  const res = await axios.get(`http://${ARCHIVER_HOST}/nodelist`)
  const nodeList: Array<{ ip: string; port: number }> = res.data?.nodeList ?? []
  assert(nodeList.length > 0, 'Archiver returned an empty nodelist')
  return nodeList.map(node => `${node.ip}:${node.port}`)
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
  const configuredCycleSeconds = Number(process.env.CYCLE_DURATION || E2E_DAO_DURATION_DEFAULTS.CYCLE_DURATION || 60)
  const waitCycles = Number(process.env.DAO_E2E_PROCESSING_WAIT_CYCLES || 20)
  const processingWaitMs = Number(process.env.DAO_E2E_PROCESSING_WAIT_MS || Math.max(10 * 60 * 1000, configuredCycleSeconds * waitCycles * 1000 + 60_000))
  console.log(
    `Waiting for network to reach processing mode (polling archiver cycleinfo; timeout ${(processingWaitMs / 60000).toFixed(1)}m / ~${waitCycles} cycles)...`,
  )

  let cycleDurationMs = 0
  let networkId = ''
  let lastProgressLog = 0
  let lastCycle = ''
  await pollUntil(
    async () => {
      try {
        const res = await axios.get(`http://${ARCHIVER_HOST}/cycleinfo/1`)
        const cycleInfo: any[] = res.data?.cycleInfo ?? []
        if (cycleInfo.length === 0) return false
        const record = cycleInfo[0]
        const currentCycle = record.counter
        if (record.mode === 'processing') {
          cycleDurationMs = record.duration * 1000
          networkId = record.networkId ?? ''
          console.log(`Network in processing mode. cycle=${currentCycle}  cycleDuration=${record.duration}s  networkId=${networkId}`)
          return true
        }
        const now = Date.now()
        if (currentCycle !== lastCycle || now - lastProgressLog >= 30_000) {
          lastCycle = currentCycle
          lastProgressLog = now
          console.log(`  cycle=${currentCycle} mode=${record.mode ?? 'unknown'} (waiting for 'processing')`)
        }
        return false
      } catch {
        return false
      }
    },
    processingWaitMs,
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

async function assertCommitteeConfigMatchesWallets(committee: TestAccount[]): Promise<void> {
  const daoParams = await getDaoParameters()
  const configured = daoParams?.committeeAddresses
  assert(Array.isArray(configured), 'network.current.dao.committeeAddresses is missing or not an array')
  const expected = committee.map(c => c.address)
  assert(
    JSON.stringify(configured) === JSON.stringify(expected),
    `dao-committee-keys.json addresses do not match network.current.dao.committeeAddresses in order. ` +
      `expected=${JSON.stringify(expected)} actual=${JSON.stringify(configured)}`,
  )
}

// Default short DAO durations (ms) for the E2E run, used unless overridden in process.env.
const E2E_DAO_DURATION_DEFAULTS: Record<string, string> = {
  // Parallel mode performs all proposal-creation setup before scenario bodies. Keep the
  // committee review window large enough that early setup proposals are still reviewable.
  DAO_REVIEW_DURATION_MS: PARALLEL ? '300000' : '90000',
  DAO_VOTING_DURATION_MS: '90000',
  DAO_GRACE_DURATION_MS: '30000',
  DAO_CLAIM_DURATION_MS: '150000',
  CYCLE_DURATION: '16',
}

async function isPortOpen(port: number, host = '127.0.0.1'): Promise<boolean> {
  return new Promise(resolve => {
    const socket = net.connect({ port, host })
    socket.once('connect', () => {
      socket.destroy()
      resolve(true)
    })
    socket.once('error', () => resolve(false))
    socket.setTimeout(1_000, () => {
      socket.destroy()
      resolve(false)
    })
  })
}

async function getOpenPorts(ports: number[]): Promise<number[]> {
  const checks = await Promise.all(ports.map(async port => ({ port, open: await isPortOpen(port) })))
  return checks.filter(check => check.open).map(check => check.port)
}

async function waitForPortsToClose(ports: number[], timeoutMs = 20_000): Promise<void> {
  let openPorts: number[] = []
  try {
    await pollUntil(async () => {
      openPorts = await getOpenPorts(ports)
      return openPorts.length === 0
    }, timeoutMs, 1_000)
  } catch {
    console.log(`    Ports still open after shutdown wait: ${openPorts.join(', ')}`)
  }
}

async function preflightFreshStart(): Promise<void> {
  const shardusPorts = [4000, ...Array.from({ length: 10 }, (_, i) => 9001 + i)]
  try {
    execa.commandSync('shardus stop-net', { stdio: [0, 1, 2] })
  } catch {
    /* network may not be running */
  }
  await waitForPortsToClose(shardusPorts)
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

  const occupiedPorts = await getOpenPorts(shardusPorts)
  assert(
    occupiedPorts.length === 0,
    `Cannot start DAO E2E network; ports still occupied after cleanup: ${occupiedPorts.join(', ')}`,
  )
}

async function startNetwork(): Promise<void> {
  console.log('Starting 10-node network with short DAO durations...')
  await preflightFreshStart()
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
  const proposers = makePool(savedProposerKeys, 10)
  const voters = makePool(savedVoterKeys, 16)
  const [proposer, proposer2, proposer3, proposer4, proposer5, proposer6, proposer7, proposer8, proposer9, proposer10] = proposers
  const [voter1, voter2, voter3, voter4, voter5, voter6, voter7, voter8, voter9, voter10, voter11, voter12, voter13, voter14, voter15, voter16] = voters

  const proposalNumbers: Record<string, number> = {
    ...(savedState?.proposalNumbers ?? {}),
    ...(savedState?.sc1ProposalN ? { sc1: savedState.sc1ProposalN } : {}),
    ...(savedState?.sc2ProposalN ? { sc2: savedState.sc2ProposalN } : {}),
    ...(savedState?.sc3ProposalN ? { sc3: savedState.sc3ProposalN } : {}),
    ...(savedState?.sc4ProposalN ? { sc4: savedState.sc4ProposalN } : {}),
    ...(savedState?.sc5ProposalN ? { sc5: savedState.sc5ProposalN } : {}),
  }
  const getProposalN = (key: string): number => proposalNumbers[key] ?? 0
  const proposalN: Record<string, number> = {
    sc1: getProposalN('sc1'),
    sc2: getProposalN('sc2'),
    sc3: getProposalN('sc3'),
    sc4: getProposalN('sc4'),
    sc5: getProposalN('sc5'),
    sc6: getProposalN('sc6'),
    sc7: getProposalN('sc7'),
    sc8Economic: getProposalN('sc8Economic'),
    sc8Protocol: getProposalN('sc8Protocol'),
    sc8LeafKey: getProposalN('sc8LeafKey'),
    sc8Archiver: getProposalN('sc8Archiver'),
    sc9: getProposalN('sc9'),
    sc10: getProposalN('sc10'),
    sc11: getProposalN('sc11'),
    sc12: getProposalN('sc12'),
    sc13: getProposalN('sc13'),
    sc14EmergencyWithhold: getProposalN('sc14EmergencyWithhold'),
    sc15A: getProposalN('sc15A'),
    sc15B: getProposalN('sc15B'),
    sc16EmergencyTimeout: getProposalN('sc16EmergencyTimeout'),
    sc17EmergencyRecovery: getProposalN('sc17EmergencyRecovery'),
  }
  const setProposalN = (key: string, value: number): number => {
    proposalNumbers[key] = value
    proposalN[key] = value
    return value
  }
  let sc2PoolBeforeWithhold = 0n

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
  await assertCommitteeConfigMatchesWallets(committee)

  const savedNetworkMismatch = Boolean(savedState && savedState.networkId !== networkId)

  // Warn if the saved network ID doesn't match — proposal numbers from a previous network are invalid.
  if (savedNetworkMismatch) {
    console.log(`  ⚠️  Run-state networkId mismatch!`)
    console.log(`  ⚠️  Saved: ${savedState?.networkId}`)
    console.log(`  ⚠️  Current: ${networkId}`)
    console.log(`  ⚠️  Restored accounts will be reused, but stale proposal numbers will be reset.`)
    for (const key of Object.keys(proposalNumbers)) delete proposalNumbers[key]
    for (const key of Object.keys(proposalN)) proposalN[key] = 0
  }

  // Snapshot all mutable run-state variables and persist to disk.
  // Called once after waitForNetwork() on a fresh run, then again after every
  // proposal-creation setup step so --step retries always have current data.
  function saveCurrentRunState(): void {
    saveRunState({
      networkId: currentNetworkId,
      proposerKeys: proposers.map(a => a.wallet.privateKey),
      voterKeys: voters.map(a => a.wallet.privateKey),
      proposalNumbers: { ...proposalNumbers },
    })
  }

  const shouldFundAccounts = !NO_START || !savedState || savedNetworkMismatch

  // Persist account keys before funding whenever this run owns account setup, so
  // retries keep targeting the same accounts even if funding is interrupted.
  if (shouldFundAccounts) saveCurrentRunState()

  // Derived timing constants
  const applyParamsPollMs = cycleDurationMs * 5   // global message fires at cycle+3
  const SLEEP_BUFFER_MS = 5_000
  const futureStartDelayMs = PARALLEL ? 120_000 : reviewDurationMs + 60_000
  // In --parallel mode, multiple scenario bodies submit overlapping transactions onto the same
  // network concurrently, which measurably increases per-tx queue/confirmation latency (we saw a
  // decisive dao_committee_vote blow past the default 2-cycle budget and an expected-reject
  // dao_apply_parameters receipt arrive after the old 5-cycle parallel budget). Give receipts
  // enough headroom to settle when running concurrently so a slow-but-valid confirmation doesn't
  // get misreported as a failure.
  txSettleTimeoutMs = cycleDurationMs * (PARALLEL ? 8 : 2) + SLEEP_BUFFER_MS

  const minVoteSpendLib = usdStrToLibCeil(minimumSpendUsdStr, stabilityFactorStr)
  console.log(`Funding: ${TEST_ACCOUNT_FUND_LIB} LIB per account; min dao_vote spend≈${minVoteSpendLib} LIB`)

  let sc1VoteExponentTarget = 1.2
  let sc4PctBurnedTarget = 70
  let sc17VoteThresholdUsdTarget = '150.0'
  let sc17UnapplyThreshold = 3
  let sc8NodeRewardTarget = '1.25'
  let sc8ArchiverActiveVersionTarget = '3.7.10'
  let sc8TopLevelActiveVersionBefore = ''
  let sc8ArchiverMinVersionBefore = ''

  if (shouldFundAccounts) {
    await step('0.1  Fund all DAO E2E accounts', async () => {
      await Promise.all([
        ...proposers.map(a => fundAccount(a, TEST_ACCOUNT_FUND_LIB)),
        ...voters.map(a => fundAccount(a, TEST_ACCOUNT_FUND_LIB)),
        ...committee.map(c => fundAccount(c, TEST_ACCOUNT_FUND_LIB)),
      ])
    })
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Scenario 1 — Happy path: governance proposal → accepted → applied → claimed
  // ─────────────────────────────────────────────────────────────────────────
  const sc1: ScenarioDef = {
    num: 1,
    name: 'Scenario 1 — Happy path (governance → accepted → applied → claimed)',
    setupSteps: [
    [
      '1.2  dao_proposal_create (governance: voteExponent 1.1 → 1.2)',
      async () => {
        const daoParams = await getDaoParameters()
        const currentVoteExponent = Number(daoParams.voteExponent)
        sc1VoteExponentTarget = currentVoteExponent === 1.2 ? 1.1 : 1.2
        const proposalFeeWei = usdStrToLibWei(daoParams.proposalFeeUsdStr, stabilityFactorStr)
        setProposalN('sc1', await createDaoProposal({
          proposer,
          title: 'Vote exponent adjustment',
          description: `Toggle voteExponent from ${currentVoteExponent} to ${sc1VoteExponentTarget}`,
          changes: [{ key: 'voteExponent', value: String(sc1VoteExponentTarget), current: String(currentVoteExponent) }],
          gracePeriodMs: graceDurationMs,
          expectedBalanceDelta: receipt => -(proposalFeeWei + asBigInt(receipt.transactionFee ?? 0n)),
        }))
        saveCurrentRunState()
        const proposal = await getProposal(proposalN.sc1)
        assert(proposal.status === 'review', `Expected status 'review', got '${proposal.status}'`)
        assert(proposal.title === 'Vote exponent adjustment', `Expected proposal title to persist, got '${proposal.title}'`)
        assert(Array.isArray(proposal.committeeAddresses) && proposal.committeeAddresses.length > 0, 'Expected committeeAddresses snapshot to be non-empty')
      },
    ],
    [
      '1.2b Derived timing and USD snapshots are correct',
      async () => {
        const proposal = await getProposal(proposalN.sc1)
        const daoParams = await getDaoParameters()
        assertDerivedTimingAndSnapshots(proposal, daoParams)
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
            proposalId: daoProposalId(proposalN.sc1),
            vote: 'accept',
            timestamp: Date.now(),
          },
          committee[0],
        )
        const proposal = await getProposal(proposalN.sc1)
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
            proposalId: daoProposalId(proposalN.sc1),
            vote: 'accept',
            timestamp: Date.now(),
          },
          committee[1],
        )
        const proposal = await getProposal(proposalN.sc1)
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
            proposalId: daoProposalId(proposalN.sc1),
            vote: 'accept',
            timestamp: Date.now(),
          },
          committee[2],
        )
        const proposal = await getProposal(proposalN.sc1)
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
        const proposalBefore = await getProposal(proposalN.sc1)
        await sleepUntilTimestamp(proposalBefore.reviewEnd, 'reviewEnd', SLEEP_BUFFER_MS)
        await injectAndAssert(
          {
            type: 'dao_committee_result',
            networkId: currentNetworkId,
            from: proposer.address,
            proposalId: daoProposalId(proposalN.sc1),
            timestamp: Date.now(),
          },
          proposer,
        )
        const proposal = await getProposal(proposalN.sc1)
        assert(proposal.status === 'voting', `Expected status 'voting', got '${proposal.status}'`)
        assert(asBigInt(proposal.voterRewardPool) > 0n, 'Expected voterRewardPool funded with proposal fee on review → voting transition')
      },
    ],

    [
      '1.6  dao_vote x2 (voter1 + voter2, both vote option 0)',
      async () => {
        // weights[i] maps 1:1 by index onto proposal.options[i] — [1, 0] puts the vote's
        // entire weight on options[0] ('yes'), mirroring the old optionIndex: 0 behavior.
        await castVote(proposalN.sc1, voter1, [1, 0], minVoteSpendLib, receipt => -(libToWei(minVoteSpendLib) + asBigInt(receipt.transactionFee ?? 0n)))
        await castVote(proposalN.sc1, voter2, [1, 0], minVoteSpendLib)
        const proposal = await getProposal(proposalN.sc1)
        assert(asBigInt(proposal.totalVote[0]) > 0n, 'Expected totalVote[0] > 0 after votes')
        assert(asBigInt(proposal.voterRewardPool) > 0n, 'Expected voterRewardPool > 0 after vote spend')
      },
    ],

    [
      '1.7  Sleep past votingEnd then dao_vote_result → accepted',
      async () => {
        const proposalBefore = await getProposal(proposalN.sc1)
        await sleepUntilTimestamp(proposalBefore.votingEnd, 'votingEnd', SLEEP_BUFFER_MS)
        const { receipt } = await injectAndAssert(
          {
            type: 'dao_vote_result',
            networkId: currentNetworkId,
            from: proposer.address,
            proposalId: daoProposalId(proposalN.sc1),
            timestamp: Date.now(),
          },
          proposer,
        )
        const proposal = await getProposal(proposalN.sc1)
        const burnAmount = asBigInt(receipt.additionalInfo.burnAmount)
        assert(proposal.status === 'accepted', `Expected status 'accepted', got '${proposal.status}'`)
        // voterRewardPool is now the fixed, immutable post-burn pool — assert the burn actually
        // reduced it relative to the pre-vote_result (pre-burn) value.
        assertBurnFields(proposal, { initial: burnAmount })
        assertBurnFields(proposal, { initial: 'positive' })
        assert(asBigInt(proposal.voterRewardPool) > 0n, 'Expected voterRewardPool > 0 after burn')
        assert(
          asBigInt(proposal.voterRewardPool) < asBigInt(proposalBefore.voterRewardPool),
          `Expected voterRewardPool to shrink after burn (before=${proposalBefore.voterRewardPool}, after=${proposal.voterRewardPool})`,
        )
        assert(asBigInt(proposal.claimedReward) === 0n, `Expected claimedReward = 0 immediately after vote_result, got ${proposal.claimedReward}`)
        assert(proposal.claimEnd > 0, `Expected claimEnd > 0, got ${proposal.claimEnd}`)
      },
    ],

    [
      '1.8  Non-voter (proposer) tries dao_claim_reward on accepted proposal → rejected',
      async () => {
        // Run immediately after 1.7 (right at votingEnd, while the full claimDuration window is
        // still ahead) rather than after the grace-period sleep in 1.11. claimEnd is now strictly
        // derived (= votingEnd + claimDuration, independent of when dao_vote_result actually
        // executes), so any extra delay eats directly into the claim window margin — running the
        // "did not vote" check here (instead of after the apply/global-message wait in 1.11) keeps us
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
            proposalId: daoProposalId(proposalN.sc1),
            timestamp: Date.now(),
          },
          proposer,
          'did not vote',
        )
      },
    ],

    [
      '1.9 dao_claim_reward (voter1 + voter2)',
      async () => {
        // Keep claims before dao_apply_parameters/global-message polling. claimEnd is fixed at
        // votingEnd + claimDuration, while apply_parameters can wait several cycles for its
        // global message; with 60s cycles that wait can consume the entire claim window.
        const claimedReward = await claimAndAssertRewards(proposalN.sc1, [voter1, voter2])
        const proposal = await getProposal(proposalN.sc1)
        assert(proposal.claimList.length === 2, `Expected 2 claimants, got ${proposal.claimList.length}`)
        assert(asBigInt(proposal.claimedReward) === claimedReward, `Expected claimedReward ${claimedReward}, got ${proposal.claimedReward}`)
        console.log(`    Rewards (time-weighted, verified exact against formula): total +${ethers.formatEther(claimedReward)} LIB`)
      },
    ],

    [
      '1.10 Double-claim rejected (voter1 claims again)',
      async () => {
        await injectExpectReject(
          {
            type: 'dao_claim_reward',
            networkId: currentNetworkId,
            from: voter1.address,
            proposalId: daoProposalId(proposalN.sc1),
            timestamp: Date.now(),
          },
          voter1,
          'already claimed',
        )
      },
    ],
    [
      '1.11 Sleep past graceDuration, dao_apply_parameters → applied + network param updated',
      async () => {
        const proposalBefore = await getProposal(proposalN.sc1)
        await sleepUntilTimestamp(proposalBefore.applyEligibleAt, 'applyEligibleAt (grace period end)', SLEEP_BUFFER_MS)
        const { receipt } = await injectAndAssert(
          {
            type: 'dao_apply_parameters',
            networkId: currentNetworkId,
            from: proposer.address,
            proposalId: daoProposalId(proposalN.sc1),
            timestamp: Date.now(),
          },
          proposer,
        )
        const proposal = await getProposal(proposalN.sc1)
        assert(proposal.status === 'applied', `Expected status 'applied', got '${proposal.status}'`)

        // Global message fires at cycle+3 — poll up to 5 cycles for param to update
        console.log(
          `    Polling up to ${applyParamsPollMs / 1000}s for network.current.dao.voteExponent === ${sc1VoteExponentTarget}` +
            ` (global msg at cycle+3 ≈ ${(cycleDurationMs * 3) / 1000}s)...`,
        )
        await waitForNetworkParameter(['current', 'dao', 'voteExponent'], sc1VoteExponentTarget, applyParamsPollMs)
        await waitForListOfChangesFromReceipt(
          `appData.dao.voteExponent=${sc1VoteExponentTarget}`,
          receipt,
          c => String(c?.appData?.dao?.voteExponent) === String(sc1VoteExponentTarget),
          applyParamsPollMs,
        )
      },
    ],
    [
      '1.12 dao_burn_reward burns remaining unclaimed pool after claimEnd',
      async () => {
        const proposalBefore = await getProposal(proposalN.sc1)
        await sleepUntilTimestamp(proposalBefore.claimEnd, 'claimEnd', SLEEP_BUFFER_MS)
        const remainingBeforeBurn = asBigInt(proposalBefore.voterRewardPool) - asBigInt(proposalBefore.claimedReward)
        const { receipt } = await injectAndAssert(
          {
            type: 'dao_burn_reward',
            networkId: currentNetworkId,
            from: voter3.address,
            proposalId: daoProposalId(proposalN.sc1),
            timestamp: Date.now(),
          },
          voter3,
          { expectedBalanceDelta: receipt => -asBigInt(receipt.transactionFee ?? 0n) },
        )
        assert(asBigInt(receipt.additionalInfo.burned) === remainingBeforeBurn, `Expected burned ${remainingBeforeBurn}, got ${receipt.additionalInfo.burned}`)
        const proposal = await getProposal(proposalN.sc1)
        assertBurnFields(proposal, { final: 'positive' })
        assert(asBigInt(proposal.claimedReward) === asBigInt(proposalBefore.claimedReward), `Expected claimedReward to remain ${proposalBefore.claimedReward} after final burn, got ${proposal.claimedReward}`)
        assert(asBigInt(proposal.voterRewardPool) === 0n, `Expected voterRewardPool === 0 after final burn, got ${proposal.voterRewardPool}`)
        await injectExpectReject(
          {
            type: 'dao_burn_reward',
            networkId: currentNetworkId,
            from: voter3.address,
            proposalId: daoProposalId(proposalN.sc1),
            timestamp: Date.now(),
          },
          voter3,
          'Nothing left to burn',
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
        setProposalN('sc2', await createDaoProposal({
          proposer,
          title: 'Committee withhold',
          description: 'Withheld test — increase pctBurned to 60',
          changes: [{ key: 'pctBurned', value: '60', current: '50' }],
          gracePeriodMs: graceDurationMs,
        }))
        saveCurrentRunState()
        const proposal = await getProposal(proposalN.sc2)
        assert(proposal.status === 'review', `Expected status 'review', got '${proposal.status}'`)
      },
    ],
    ],
    bodySteps: [
    [
      '2.2  committee_vote withhold x3 → decisive tally recorded, status remains review',
      async () => {
        // Rotate away from the default [0..2] group so parallel runs spread committee traffic.
        for (let i = 2; i < 5; i++) {
          await injectAndAssert(
            {
              type: 'dao_committee_vote',
              networkId: currentNetworkId,
              from: committee[i].address,
              proposalId: daoProposalId(proposalN.sc2),
              vote: 'withhold',
              withheldReason: 'Test withhold',
              timestamp: Date.now(),
            },
            committee[i],
          )
        }
        // Regular proposals never flip status mid-review, even on a decisive withhold tally —
        // only dao_committee_result (after reviewEnd) decides voting vs withheld.
        const proposal = await getProposal(proposalN.sc2)
        assert(proposal.status === 'review', `Expected status 'review' (decided only at reviewEnd), got '${proposal.status}'`)
      },
    ],

    [
      '2.2b committee_result after reviewEnd → withheld (>50% withhold votes)',
      async () => {
        const proposalBefore = await getProposal(proposalN.sc2)
        await sleepUntilTimestamp(proposalBefore.reviewEnd, 'reviewEnd', SLEEP_BUFFER_MS)
        await injectAndAssert(
          { type: 'dao_committee_result', networkId: currentNetworkId, from: proposer.address, proposalId: daoProposalId(proposalN.sc2), timestamp: Date.now() },
          proposer,
        )
        const proposal = await getProposal(proposalN.sc2)
        assert(proposal.status === 'withheld', `Expected status 'withheld', got '${proposal.status}'`)
        sc2PoolBeforeWithhold = asBigInt(proposalBefore.voterRewardPool)
      },
    ],

    [
      '2.3  voterRewardPool === 0, initialBurnedReward === pre-withhold pool (proposalFee burned on withhold)',
      async () => {
        const proposal = await getProposal(proposalN.sc2)
        assert(
          asBigInt(proposal.voterRewardPool) === 0n,
          `Expected voterRewardPool = 0n, got ${proposal.voterRewardPool}`,
        )
        // sc2PoolBeforeWithhold is only populated when 2.2 runs in the same process; skip the
        // exact-equality check on a standalone `--step 2.3` rerun where it defaults to 0n.
        if (sc2PoolBeforeWithhold > 0n) {
          assert(
            asBigInt(proposal.initialBurnedReward) === sc2PoolBeforeWithhold,
            `Expected initialBurnedReward (${proposal.initialBurnedReward}) === pre-withhold voterRewardPool (${sc2PoolBeforeWithhold})`,
          )
        }
        assert(asBigInt(proposal.initialBurnedReward) > 0n, 'Expected initialBurnedReward > 0 (non-emergency proposal fee was burned)')
      },
    ],
    [
      '2.4  dao_burn_reward rejected for regular withheld proposal',
      async () => {
        await injectExpectReject(
          {
            type: 'dao_burn_reward',
            networkId: currentNetworkId,
            from: proposer.address,
            proposalId: daoProposalId(proposalN.sc2),
            timestamp: Date.now(),
          },
          proposer,
          'withheld',
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
        setProposalN('sc3', await createDaoProposal({
          proposer,
          title: 'Zero-vote acceptance',
          description: 'Auto-accept test — committee_result will advance this after reviewEnd',
          changes: [{ key: 'pctBurned', value: '55', current: '50' }],
          gracePeriodMs: graceDurationMs,
        }))
        saveCurrentRunState()
        const proposal = await getProposal(proposalN.sc3)
        assert(proposal.status === 'review', `Expected status 'review', got '${proposal.status}'`)
      },
    ],
    ],
    bodySteps: [
    [
      '3.2  Sleep past reviewEnd',
      async () => {
        const proposalBefore = await getProposal(proposalN.sc3)
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
            proposalId: daoProposalId(proposalN.sc3),
            timestamp: Date.now(),
          },
          proposer,
        )
        const proposal = await getProposal(proposalN.sc3)
        assert(proposal.status === 'voting', `Expected status 'voting', got '${proposal.status}'`)
      },
    ],
    [
      '3.4  dao_committee_result rejected after proposal already moved to voting',
      async () => {
        await injectExpectReject(
          {
            type: 'dao_committee_result',
            networkId: currentNetworkId,
            from: proposer.address,
            proposalId: daoProposalId(proposalN.sc3),
            timestamp: Date.now(),
          },
          proposer,
          'not in review status',
        )
      },
    ],
    [
      '3.5  Sleep past votingEnd then dao_vote_result accepts zero-vote proposal via option 0',
      async () => {
        const proposalBefore = await getProposal(proposalN.sc3)
        await sleepUntilTimestamp(proposalBefore.votingEnd, 'votingEnd', SLEEP_BUFFER_MS)
        const { receipt } = await injectAndAssert(
          {
            type: 'dao_vote_result',
            networkId: currentNetworkId,
            from: proposer.address,
            proposalId: daoProposalId(proposalN.sc3),
            timestamp: Date.now(),
          },
          proposer,
        )
        const proposal = await getProposal(proposalN.sc3)
        assert(proposal.status === 'accepted', `Expected zero-vote proposal to be accepted by option 0 tie-break, got ${proposal.status}`)
        assert(receipt.additionalInfo?.winningOption === proposal.options[0], `Expected zero-vote tie to pick option 0, got ${JSON.stringify(receipt.additionalInfo)}`)
        assert(proposal.totalVote.every(vote => asBigInt(vote) === 0n), `Expected every totalVote entry to stay zero, got ${proposal.totalVote}`)
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
        await expectProposalCreateReject(
          proposalNumber => ({
            type: 'dao_proposal_create',
            networkId: currentNetworkId,
            from: voter1.address,
            proposalId: daoProposalId(proposalNumber),
            metaId: ShardusCrypto.hash('dao proposals meta'),
            proposalType: 'governance',
            emergency: true,
            title: 'Unauthorized emergency proposal',
            description: 'Emergency proposal from non-committee — must be rejected',
            options: ['yes', 'no'],
            gracePeriod: graceDurationMs,
            governance: {
              changes: [{ key: 'pctBurned', value: '70', current: '50' }],
            },
            timestamp: Date.now(),
          }),
          voter1,
          'committee',
        )
      },
    ],

    [
      '4.2  committee[0] creates emergency proposal (status review)',
      async () => {
        const daoParams = await getDaoParameters()
        const currentPctBurned = Number(daoParams.pctBurned)
        sc4PctBurnedTarget = currentPctBurned === 70 ? 65 : 70
        setProposalN('sc4', await createDaoProposal({
          proposer: committee[0],
          emergency: true,
          title: 'Emergency burn adjustment',
          description: `Emergency governance proposal toggles pctBurned from ${currentPctBurned} to ${sc4PctBurnedTarget}`,
          changes: [{ key: 'pctBurned', value: String(sc4PctBurnedTarget), current: String(currentPctBurned) }],
          gracePeriodMs: graceDurationMs,
        }))
        saveCurrentRunState()
        const proposal = await getProposal(proposalN.sc4)
        assert(proposal.status === 'review', `Expected status 'review', got '${proposal.status}'`)
        assert(proposal.emergency === true, 'Expected emergency === true')
      },
    ],
    ],
    bodySteps: [
    [
      '4.3  committee_vote accept x3 → accepted (emergency skips community voting)',
      async () => {
        for (const i of [3, 4, 0]) {
          await injectAndAssert(
            {
              type: 'dao_committee_vote',
              networkId: currentNetworkId,
              from: committee[i].address,
              proposalId: daoProposalId(proposalN.sc4),
              vote: 'accept',
              timestamp: Date.now(),
            },
            committee[i],
          )
        }
        const proposal = await getProposal(proposalN.sc4)
        assert(
          proposal.status === 'accepted',
          `Expected status 'accepted' for emergency, got '${proposal.status}'`,
        )
      },
    ],

    [
      '4.4  voterRewardPool === 0 (emergency proposals are exempt from the proposal fee)',
      async () => {
        // Emergency proposals pay no proposal fee, so nothing is seeded into voterRewardPool
        // at creation. With no community voters and a decisive accept (no withhold), the pool
        // stays at 0 — nothing is burned either.
        const proposal = await getProposal(proposalN.sc4)
        assert(
          asBigInt(proposal.voterRewardPool) === 0n,
          `Expected voterRewardPool === 0n (no proposal fee for emergency proposals), got ${proposal.voterRewardPool}`,
        )
        assert(asBigInt(proposal.initialBurnedReward) === 0n, `Expected initialBurnedReward === 0n (not withheld), got ${proposal.initialBurnedReward}`)
        assert(asBigInt(proposal.finalBurnedReward) === 0n, `Expected finalBurnedReward === 0n (before dao_burn_reward), got ${proposal.finalBurnedReward}`)
      },
    ],

    [
      '4.5  votingEnd derived (collapses onto votingStart/reviewEnd — zero-length nominal voting phase)',
      async () => {
        const proposal = await getProposal(proposalN.sc4)
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

    [
      '4.6  dao_apply_parameters from non-committee member → rejected',
      async () => {
        await injectExpectReject(
          {
            type: 'dao_apply_parameters',
            networkId: currentNetworkId,
            from: voter1.address,
            proposalId: daoProposalId(proposalN.sc4),
            timestamp: Date.now(),
          },
          voter1,
          'committee member',
        )
      },
    ],

    [
      '4.7  dao_apply_parameters from committee member → applied immediately (no grace period)',
      async () => {
        // Emergency proposals can be applied immediately after acceptance — no need to wait
        // for applyEligibleAt/gracePeriod (R20).
        const { receipt } = await injectAndAssert(
          {
            type: 'dao_apply_parameters',
            networkId: currentNetworkId,
            from: committee[0].address,
            proposalId: daoProposalId(proposalN.sc4),
            timestamp: Date.now(),
          },
          committee[0],
        )
        const proposal = await getProposal(proposalN.sc4)
        assert(proposal.status === 'applied', `Expected status 'applied', got '${proposal.status}'`)
        await waitForNetworkParameter(['current', 'dao', 'pctBurned'], sc4PctBurnedTarget, applyParamsPollMs)
        await waitForListOfChangesFromReceipt(
          `appData.dao.pctBurned=${sc4PctBurnedTarget}`,
          receipt,
          c => String(c?.appData?.dao?.pctBurned) === String(sc4PctBurnedTarget),
          applyParamsPollMs,
        )
      },
    ],

    [
      '4.8  dao_burn_reward after claimEnd and repeat call → rejected (nothing left to burn)',
      async () => {
        const proposalBefore = await getProposal(proposalN.sc4)
        await sleepUntilTimestamp(proposalBefore.claimEnd, 'claimEnd', SLEEP_BUFFER_MS)
        for (const actor of [voter1, voter2]) {
          await injectExpectReject(
            {
              type: 'dao_burn_reward',
              networkId: currentNetworkId,
              from: actor.address,
              proposalId: daoProposalId(proposalN.sc4),
              timestamp: Date.now(),
            },
            actor,
            'Nothing left to burn',
          )
        }
        const proposal = await getProposal(proposalN.sc4)
        assert(asBigInt(proposal.finalBurnedReward) === 0n, `Expected finalBurnedReward === 0n (no-op burn), got ${proposal.finalBurnedReward}`)
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
        setProposalN('sc5', await createDaoProposal({
          proposer,
          title: 'Committee access control',
          description: 'Access control test proposal — stays in review',
          changes: [{ key: 'pctBurned', value: '45', current: '50' }],
          gracePeriodMs: graceDurationMs,
        }))
        saveCurrentRunState()
        // voter1 is not a committee member — should be rejected with 'committee'
        await injectExpectReject(
          {
            type: 'dao_committee_vote',
            networkId: currentNetworkId,
            from: voter1.address,
            proposalId: daoProposalId(proposalN.sc5),
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
            proposalId: daoProposalId(proposalN.sc5),
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
            proposalId: daoProposalId(proposalN.sc5),
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
    setupSteps: [
    [
      '6.1  Create governance proposal for rejected branch',
      async () => {
        setProposalN('sc6', await createDaoProposal({
          proposer: proposer4,
          title: 'Rejected proposal branch',
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
        await committeeAcceptToVoting(proposalN.sc6, proposer4, committee, SLEEP_BUFFER_MS, [2, 3, 4])
      },
    ],
    [
      '6.3  Community votes no → dao_vote_result rejects and burns reward pool',
      async () => {
        await castVote(proposalN.sc6, voter9, [0, 1], minVoteSpendLib)
        await castVote(proposalN.sc6, voter10, [0, 1], minVoteSpendLib)
        const beforeResult = await getProposal(proposalN.sc6)
        const poolBeforeBurn = asBigInt(beforeResult.voterRewardPool)
        const { receipt } = await finalizeVote(proposalN.sc6, proposer4, SLEEP_BUFFER_MS)
        const proposal = await getProposal(proposalN.sc6)
        const burnAmount = asBigInt(receipt.additionalInfo.burnAmount)
        assert(proposal.status === 'rejected', `Expected rejected status, got ${proposal.status}`)
        assert(burnAmount > 0n, `Expected non-zero burnAmount, got ${burnAmount}`)
        assertBurnFields(proposal, { initial: burnAmount })
        assertBurnFields(proposal, { initial: 'positive' })
        assert(asBigInt(proposal.voterRewardPool) > 0n, 'Expected voterRewardPool > 0 after burn on rejected proposal')
        assert(asBigInt(proposal.claimedReward) === 0n, `Expected claimedReward = 0 before rejected-branch claims, got ${proposal.claimedReward}`)
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
            from: voter9.address,
            proposalId: daoProposalId(proposalN.sc6),
            timestamp: Date.now(),
          },
          voter9,
        )
        const reward = asBigInt(receipt.additionalInfo.reward)
        assert(reward > 0n, 'Expected non-zero claim reward on rejected proposal')
        const proposal = await getProposal(proposalN.sc6)
        assert(asBigInt(proposal.claimedReward) === reward, `Expected claimedReward to equal first rejected-branch claim reward ${reward}, got ${proposal.claimedReward}`)
        assert(asBigInt(proposal.claimedReward) <= asBigInt(proposal.voterRewardPool), 'Rejected-branch claim exceeded the post-burn voterRewardPool')
      },
    ],
    [
      '6.4b dao_burn_reward burns rejected proposal remainder after claimEnd',
      async () => {
        const proposalBefore = await getProposal(proposalN.sc6)
        await sleepUntilTimestamp(proposalBefore.claimEnd, 'claimEnd', SLEEP_BUFFER_MS)
        const remainingBeforeBurn = asBigInt(proposalBefore.voterRewardPool) - asBigInt(proposalBefore.claimedReward)
        const { receipt } = await injectAndAssert(
          {
            type: 'dao_burn_reward',
            networkId: currentNetworkId,
            from: voter10.address,
            proposalId: daoProposalId(proposalN.sc6),
            timestamp: Date.now(),
          },
          voter10,
        )
        assert(asBigInt(receipt.additionalInfo.burned) === remainingBeforeBurn, `Expected burned ${remainingBeforeBurn}, got ${receipt.additionalInfo.burned}`)
        const proposal = await getProposal(proposalN.sc6)
        assertBurnFields(proposal, { final: 'positive' })
        assert(asBigInt(proposal.claimedReward) === asBigInt(proposalBefore.claimedReward), `Expected claimedReward to remain ${proposalBefore.claimedReward} after final burn, got ${proposal.claimedReward}`)
        assert(asBigInt(proposal.voterRewardPool) === 0n, `Expected voterRewardPool === 0 after final burn, got ${proposal.voterRewardPool}`)
      },
    ],
    [
      '6.5  dao_apply_parameters rejected for rejected proposal',
      async () => {
        await expectPreCrackRejectNoGlobalChange(
          {
            type: 'dao_apply_parameters',
            networkId: currentNetworkId,
            from: proposer4.address,
            proposalId: daoProposalId(proposalN.sc6),
            timestamp: Date.now(),
          },
          proposer4,
          'accepted status',
          proposalN.sc6,
          c => String(c?.appData?.dao?.pctBurned) === '55',
        )
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
    setupSteps: [
    [
      '7.1  Create 3-option governance proposal',
      async () => {
        setProposalN('sc7', await createDaoProposal({
          proposer: proposer5,
          title: 'Weighted multi-option vote',
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
        await committeeAcceptToVoting(proposalN.sc7, proposer5, committee, SLEEP_BUFFER_MS, [0, 3, 4])
      },
    ],
    [
      '7.3  Cast split votes and verify stable weight invariants',
      async () => {
        const r1 = await castVote(proposalN.sc7, voter5, [3, 5, 2], minVoteSpendLib)
        const r2 = await castVote(proposalN.sc7, voter6, [0, 1, 1], minVoteSpendLib * 2)
        const w1 = r1.receipt.additionalInfo.optionWeights.map(asBigInt)
        const w2 = r2.receipt.additionalInfo.optionWeights.map(asBigInt)
        assert(w1.length === 3 && w2.length === 3, 'Expected receipt optionWeights length to match 3 proposal options')
        assert(w1.every(w => w > 0n), `Expected all non-zero split weights to produce non-zero option weights, got ${w1}`)
        assert(w1[1] > w1[0] && w1[0] > w1[2], `Expected [3,5,2] ordering to be option1 > option0 > option2, got ${w1}`)
        assert(w2[0] === 0n && w2[1] > 0n && w2[2] > 0n, `Expected zero input weight to produce zero option weight, got ${w2}`)

        const proposal = await getProposal(proposalN.sc7)
        const expected = [w1[0] + w2[0], w1[1] + w2[1], w1[2] + w2[2]]
        const actual = proposal.totalVote.map(asBigInt)
        assert(
          actual.length === expected.length && actual.every((w, i) => w === expected[i]),
          `Expected proposal.totalVote ${expected} to equal accumulated receipt optionWeights, got ${actual}`,
        )
      },
    ],
    [
      '7.4  Repeated vote from same address is additive but voterList stays unique',
      async () => {
        const before = await getProposal(proposalN.sc7)
        const voterEntryBefore = before.voterList.find(v => v.address === voter5.address)
        assert(voterEntryBefore != null, 'Expected voter5 to be in voterList before repeated vote')
        const beforeTotal = before.totalVote.map(asBigInt)
        const { receipt } = await castVote(proposalN.sc7, voter5, [1, 0, 2], minVoteSpendLib)
        const addedWeights = receipt.additionalInfo.optionWeights.map(asBigInt)
        const after = await getProposal(proposalN.sc7)
        const afterTotal = after.totalVote.map(asBigInt)
        assert(afterTotal.every((w, i) => w === beforeTotal[i] + addedWeights[i]), `Expected repeated vote to add ${addedWeights} to ${beforeTotal}, got ${afterTotal}`)
        const voter5Entries = after.voterList.filter(v => v.address === voter5.address)
        assert(voter5Entries.length === 1, `Expected voter5 to appear once in voterList, got ${voter5Entries.length}`)
        assert(voter5Entries[0].timestamp === voterEntryBefore.timestamp, `Expected voter5 voterList timestamp to remain ${voterEntryBefore.timestamp}, got ${voter5Entries[0].timestamp}`)
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
    setupSteps: [
    [
      '8.1  Create economic proposal for top-level network.current key',
      async () => {
        const currentValue = String(await getCurrentNetworkValue('nodeRewardAmountUsdStr'))
        sc8NodeRewardTarget = currentValue === '1.25' ? '1.35' : '1.25'
        setProposalN('sc8Economic', await createDaoProposal({
          proposer: proposer6,
          proposalType: 'economic',
          title: 'Node reward adjustment',
          description: `Economic proposal updates nodeRewardAmountUsdStr from ${currentValue} to ${sc8NodeRewardTarget}`,
          changes: [{ key: 'nodeRewardAmountUsdStr', value: sc8NodeRewardTarget, current: currentValue }],
          gracePeriodMs: graceDurationMs,
        }))
        saveCurrentRunState()
      },
    ],
    [
      '8.2  Reject governance proposal using economic-only key',
      async () => {
        await expectProposalCreateReject(
          proposalNumber => ({
            type: 'dao_proposal_create',
            networkId: currentNetworkId,
            from: proposer6.address,
            proposalId: daoProposalId(proposalNumber),
            metaId: daoMetaId(),
            proposalType: 'governance',
            emergency: false,
            title: 'Invalid governance namespace',
            description: 'Invalid governance namespace test',
            options: ['yes', 'no'],
            gracePeriod: graceDurationMs,
            governance: { changes: [{ key: 'nodeRewardAmountUsdStr', value: '1.5', current: '1.0' }] },
            timestamp: Date.now(),
          }),
          proposer6,
          'governance parameters',
        )
      },
    ],
    [
      '8.3  Reject protocol proposal using network-only key',
      async () => {
        await expectProposalCreateReject(
          proposalNumber => ({
            type: 'dao_proposal_create',
            networkId: currentNetworkId,
            from: proposer7.address,
            proposalId: daoProposalId(proposalNumber),
            metaId: daoMetaId(),
            proposalType: 'protocol',
            emergency: false,
            title: 'Invalid protocol namespace',
            description: 'Invalid protocol namespace test',
            options: ['yes', 'no'],
            gracePeriod: graceDurationMs,
            protocol: { changes: [{ key: 'nodeRewardAmountUsdStr', value: '1.5', current: '1.25' }] },
            timestamp: Date.now(),
          }),
          proposer7,
          'protocol parameters',
        )
      },
    ],
    [
      '8.3b Create protocol section-object proposal',
      async () => {
        setProposalN('sc8Protocol', await createDaoProposal({
          proposer: proposer7,
          proposalType: 'protocol',
          title: 'Debug configuration update',
          description: 'Protocol proposal patches debug.countEndpointStart',
          changes: [{ key: 'debug', value: '{"countEndpointStart":0}', current: '{"countEndpointStart":-1}' }],
          gracePeriodMs: graceDurationMs,
        }))
        saveCurrentRunState()
      },
    ],
    [
      '8.3c Create protocol leaf-key proposal',
      async () => {
        setProposalN('sc8LeafKey', await createDaoProposal({
          proposer: proposer6,
          proposalType: 'protocol',
          title: 'Protocol leaf-key update',
          description: 'Protocol proposal via leaf keys (p2p.minNodes, p2p.maxNodes, debug.countEndpointStart)',
          changes: [
            { key: 'minNodes', value: '12', current: '10' },
            { key: 'maxNodes', value: '1150', current: '1100' },
            { key: 'countEndpointStart', value: '-2', current: '-1' },
          ],
          gracePeriodMs: graceDurationMs,
        }))
        saveCurrentRunState()
      },
    ],
    [
      '8.3d Create archiver economic proposal',
      async () => {
        sc8TopLevelActiveVersionBefore = String(await getCurrentNetworkValue('activeVersion'))
        const archiverBefore = (await getCurrentNetworkValue('archiver')) as any
        sc8ArchiverMinVersionBefore = String(archiverBefore?.minVersion)
        const [maj, min, patch] = String(archiverBefore?.activeVersion ?? '3.7.9').split('.').map(Number)
        sc8ArchiverActiveVersionTarget = `${maj}.${min}.${patch + 1}`
        // Send only two of the three archiver fields. updateNetworkChangeQueue
        // deep-merges object payloads, so omitted fields such as minVersion must
        // survive unchanged instead of being lost to a shallow replacement.
        setProposalN('sc8Archiver', await createDaoProposal({
          proposer: proposer7,
          proposalType: 'economic',
          title: 'Archiver version update',
          description: `Economic proposal bumps archiver activeVersion and latestVersion to ${sc8ArchiverActiveVersionTarget}`,
          changes: [{
            key: 'archiver',
            value: Utils.safeStringify({ activeVersion: sc8ArchiverActiveVersionTarget, latestVersion: sc8ArchiverActiveVersionTarget }),
            current: Utils.safeStringify({ activeVersion: archiverBefore?.activeVersion, latestVersion: archiverBefore?.latestVersion }),
          }],
          gracePeriodMs: graceDurationMs,
        }))
        saveCurrentRunState()
      },
    ],
    ],
    parallelBodySteps: true,
    // 8.5 and 8.6 both touch debug.countEndpointStart. Their assertions are
    // receipt-correlated, and no later step depends on the final runtime value.
    bodySteps: [
    [
      '8.4  Economic proposal applies via apply_change_network_param',
      async () => {
        await committeeAcceptToVoting(proposalN.sc8Economic, proposer6, committee, SLEEP_BUFFER_MS, [1, 2, 3])
        await castVote(proposalN.sc8Economic, voter7, [1, 0], minVoteSpendLib)
        await finalizeVote(proposalN.sc8Economic, proposer6, SLEEP_BUFFER_MS)
        const { receipt } = await applyAcceptedProposal(proposalN.sc8Economic, proposer6, SLEEP_BUFFER_MS)
        await waitForNetworkParameter(['current', 'nodeRewardAmountUsdStr'], sc8NodeRewardTarget, applyParamsPollMs)
        await waitForListOfChangesFromReceipt(
          `appData.nodeRewardAmountUsdStr=${sc8NodeRewardTarget}`,
          receipt,
          c => String(c?.appData?.nodeRewardAmountUsdStr) === sc8NodeRewardTarget,
          applyParamsPollMs,
        )
      },
    ],
    [
      '8.5  Protocol section-object proposal applies via apply_change_config',
      async () => {
        await committeeAcceptToVoting(proposalN.sc8Protocol, proposer7, committee, SLEEP_BUFFER_MS, [0, 2, 4])
        await castVote(proposalN.sc8Protocol, voter8, [1, 0], minVoteSpendLib)
        await finalizeVote(proposalN.sc8Protocol, proposer7, SLEEP_BUFFER_MS)
        const { receipt } = await applyAcceptedProposal(proposalN.sc8Protocol, proposer7, SLEEP_BUFFER_MS)
        await waitForListOfChangesFromReceipt(
          'change.debug.countEndpointStart=0',
          receipt,
          c => c?.change?.debug?.countEndpointStart === 0,
          applyParamsPollMs,
        )
      },
    ],
    [
      '8.6  Protocol proposal with leaf keys: sibling merge under p2p + nested debug leaf',
      async () => {
        await committeeAcceptToVoting(proposalN.sc8LeafKey, proposer6, committee, SLEEP_BUFFER_MS, [0, 1, 2])
        await castVote(proposalN.sc8LeafKey, voter7, [1, 0], minVoteSpendLib)
        await finalizeVote(proposalN.sc8LeafKey, proposer6, SLEEP_BUFFER_MS)
        const { receipt } = await applyAcceptedProposal(proposalN.sc8LeafKey, proposer6, SLEEP_BUFFER_MS)
        const receiptChange = (receipt.additionalInfo?.change ?? {}) as any
        assert(
          receiptChange?.change?.p2p?.minNodes === 12 && receiptChange?.change?.p2p?.maxNodes === 1150 && receiptChange?.change?.debug?.countEndpointStart === -2,
          `Expected receipt change to include p2p.minNodes, p2p.maxNodes, debug.countEndpointStart, got ${JSON.stringify(receiptChange)}`,
        )
        // The two p2p.* leaves must deep-merge into a single change.p2p object (sibling merge),
        // alongside the unrelated change.debug leaf.
        await waitForListOfChangesFromReceipt(
          'change.p2p.{minNodes:12,maxNodes:1150} & change.debug.countEndpointStart=-2',
          receipt,
          c => c?.change?.p2p?.minNodes === 12 && c?.change?.p2p?.maxNodes === 1150 && c?.change?.debug?.countEndpointStart === -2,
          applyParamsPollMs,
        )
      },
    ],
    [
      '8.7  Reject proposal with overlapping resolved-path changes (section + leaf under it)',
      async () => {
        await expectProposalCreateReject(
          proposalNumber => ({
            type: 'dao_proposal_create',
            networkId: currentNetworkId,
            from: proposer7.address,
            proposalId: daoProposalId(proposalNumber),
            metaId: daoMetaId(),
            proposalType: 'protocol',
            emergency: false,
            title: 'Overlapping protocol paths',
            description: 'Overlapping resolved-path test: debug section + debug.countEndpointStart leaf',
            options: ['yes', 'no'],
            gracePeriod: graceDurationMs,
            protocol: {
              changes: [
                { key: 'debug', value: '{"countEndpointStart":-3}', current: '{"countEndpointStart":-1}' },
                { key: 'countEndpointStart', value: '-3', current: '-1' },
              ],
            },
            timestamp: Date.now(),
          }),
          proposer7,
          'overlapping targets',
        )
      },
    ],
    [
      '8.8  Economic proposal partially updates network.current.archiver, leaving unspecified fields and top-level version untouched',
      async () => {
        assert(proposalN.sc8Archiver > 0, 'sc8Archiver proposal number is missing; run setup step 8.3d before 8.8')
        {
          const proposal = await getProposal(proposalN.sc8Archiver)
          sc8ArchiverActiveVersionTarget = archiverActiveVersionFromProposal(proposal) ?? sc8ArchiverActiveVersionTarget
        }
        const archiverBeforeApply = (await getCurrentNetworkValue('archiver')) as any
        const expectedMinVersion = sc8ArchiverMinVersionBefore || String(archiverBeforeApply?.minVersion)
        const expectedTopLevelActiveVersion = sc8TopLevelActiveVersionBefore || String(await getCurrentNetworkValue('activeVersion'))
        await committeeAcceptToVoting(proposalN.sc8Archiver, proposer7, committee, SLEEP_BUFFER_MS, [0, 1, 2])
        await castVote(proposalN.sc8Archiver, voter8, [1, 0], minVoteSpendLib)
        await finalizeVote(proposalN.sc8Archiver, proposer7, SLEEP_BUFFER_MS)
        const { receipt } = await applyAcceptedProposal(proposalN.sc8Archiver, proposer7, SLEEP_BUFFER_MS)
        const receiptChange = (receipt.additionalInfo?.change ?? {}) as any
        assert(receiptChange?.appData?.archiver?.activeVersion === sc8ArchiverActiveVersionTarget, `Expected receipt appData.archiver.activeVersion=${sc8ArchiverActiveVersionTarget}, got ${JSON.stringify(receiptChange)}`)
        assert(receiptChange?.appData?.archiver?.latestVersion === sc8ArchiverActiveVersionTarget, `Expected receipt appData.archiver.latestVersion=${sc8ArchiverActiveVersionTarget}, got ${JSON.stringify(receiptChange)}`)
        await waitForListOfChangesFromReceipt(
          `appData.archiver.activeVersion=${sc8ArchiverActiveVersionTarget}`,
          receipt,
          c => c?.appData?.archiver?.activeVersion === sc8ArchiverActiveVersionTarget,
          applyParamsPollMs,
        )
        await waitForNetworkParameter(['current', 'archiver', 'activeVersion'], sc8ArchiverActiveVersionTarget, applyParamsPollMs)
        // Verify both changed fields updated and the omitted field (minVersion) was deep-merged, not overwritten.
        const archiverAfter = (await getCurrentNetworkValue('archiver')) as any
        assert(archiverAfter?.activeVersion === sc8ArchiverActiveVersionTarget, `Expected archiver.activeVersion=${sc8ArchiverActiveVersionTarget}, got ${archiverAfter?.activeVersion}`)
        assert(archiverAfter?.latestVersion === sc8ArchiverActiveVersionTarget, `Expected archiver.latestVersion=${sc8ArchiverActiveVersionTarget}, got ${archiverAfter?.latestVersion}`)
        assert(archiverAfter?.minVersion === expectedMinVersion, `Expected archiver.minVersion to remain ${expectedMinVersion} (not in payload), got ${archiverAfter?.minVersion}`)
        // Verify the top-level network activeVersion (a different field) was not touched.
        const topLevelActiveVersionAfter = String(await getCurrentNetworkValue('activeVersion'))
        assert(
          topLevelActiveVersionAfter === expectedTopLevelActiveVersion,
          `Expected top-level activeVersion to remain ${expectedTopLevelActiveVersion}, got ${topLevelActiveVersionAfter}`,
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
    setupSteps: [
    [
      '9.1  Reject proposal with startTime before creation time',
      async () => {
        const timestamp = Date.now()
        await expectProposalCreateReject(
          proposalNumber => ({
            type: 'dao_proposal_create',
            networkId: currentNetworkId,
            from: proposer2.address,
            proposalId: daoProposalId(proposalNumber),
            metaId: daoMetaId(),
            proposalType: 'governance',
            emergency: false,
            title: 'Past start time',
            description: 'Past startTime rejection test',
            options: ['yes', 'no'],
            gracePeriod: graceDurationMs,
            governance: { changes: [{ key: 'pctBurned', value: '52', current: '50' }] },
            startTime: timestamp - 1,
            timestamp,
          }),
          proposer2,
          'cannot be earlier',
        )
      },
    ],
    [
      '9.2  Create proposal with future startTime',
      async () => {
        setProposalN('sc9', await createDaoProposal({
          proposer: proposer2,
          title: 'Scheduled proposal start',
          description: 'Future startTime scheduling test',
          changes: [{ key: 'pctBurned', value: '53', current: '50' }],
          gracePeriodMs: graceDurationMs,
          startTime: nowPlus(futureStartDelayMs),
        }))
        saveCurrentRunState()
        const proposal = await getProposal(proposalN.sc9)
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
            from: committee[1].address,
            proposalId: daoProposalId(proposalN.sc9),
            vote: 'accept',
            timestamp: Date.now(),
          },
          committee[1],
          'has not started',
        )
      },
    ],
    [
      '9.4  Committee vote succeeds after startTime while status remains review',
      async () => {
        const proposalBefore = await getProposal(proposalN.sc9)
        await sleepUntilTimestamp(proposalBefore.startTime, 'startTime', SLEEP_BUFFER_MS)
        await injectAndAssert(
          {
            type: 'dao_committee_vote',
            networkId: currentNetworkId,
            from: committee[1].address,
            proposalId: daoProposalId(proposalN.sc9),
            vote: 'accept',
            timestamp: Date.now(),
          },
          committee[1],
        )
        const proposal = await getProposal(proposalN.sc9)
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
    setupSteps: [
    [
      '10.1 Create proposal for committee vote switch',
      async () => {
        setProposalN('sc10', await createDaoProposal({
          proposer: proposer8,
          title: 'Committee vote switch',
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
          { type: 'dao_committee_vote', networkId: currentNetworkId, from: committee[3].address, proposalId: daoProposalId(proposalN.sc10), vote: 'accept', timestamp: Date.now() },
          committee[3],
        )
        await injectAndAssert(
          {
            type: 'dao_committee_vote',
            networkId: currentNetworkId,
            from: committee[3].address,
            proposalId: daoProposalId(proposalN.sc10),
            vote: 'withhold',
            withheldReason: 'Need more analysis',
            timestamp: Date.now(),
          },
          committee[3],
        )
        const proposal = await getProposal(proposalN.sc10)
        const entries = proposal.committeeVotes.filter(v => v.memberAddress === committee[3].address)
        assert(entries.length === 1, `Expected one committeeVotes entry after switch, got ${entries.length}`)
        assert(entries[0].vote === 'withhold' && entries[0].withheldReason === 'Need more analysis', `Expected latest withhold vote, got ${JSON.stringify(entries[0])}`)
      },
    ],
    [
      '10.3 Final withhold tally becomes decisive, but status remains review',
      async () => {
        for (const i of [1, 4]) {
          await injectAndAssert(
            {
              type: 'dao_committee_vote',
              networkId: currentNetworkId,
              from: committee[i].address,
              proposalId: daoProposalId(proposalN.sc10),
              vote: 'withhold',
              withheldReason: 'Committee withhold regression test',
              timestamp: Date.now(),
            },
            committee[i],
          )
        }
        // Regular proposals never flip status mid-review, even on a decisive withhold tally —
        // only dao_committee_result (after reviewEnd) decides voting vs withheld.
        const proposal = await getProposal(proposalN.sc10)
        assert(proposal.status === 'review', `Expected status 'review' (decided only at reviewEnd), got ${proposal.status}`)
      },
    ],
    [
      '10.4 committee_result after reviewEnd → withheld (>50% withhold votes)',
      async () => {
        const proposalBefore = await getProposal(proposalN.sc10)
        await sleepUntilTimestamp(proposalBefore.reviewEnd, 'reviewEnd', SLEEP_BUFFER_MS)
        await injectAndAssert(
          { type: 'dao_committee_result', networkId: currentNetworkId, from: proposer3.address, proposalId: daoProposalId(proposalN.sc10), timestamp: Date.now() },
          proposer3,
        )
        const proposal = await getProposal(proposalN.sc10)
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
    setupSteps: [
    [
      '11.1 Create proposal for tied committee split',
      async () => {
        setProposalN('sc11', await createDaoProposal({
          proposer: proposer9,
          title: 'Non-decisive committee split',
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
        for (const i of [2, 4]) {
          await injectAndAssert(
            { type: 'dao_committee_vote', networkId: currentNetworkId, from: committee[i].address, proposalId: daoProposalId(proposalN.sc11), vote: 'accept', timestamp: Date.now() },
            committee[i],
          )
        }
        for (const i of [0, 1]) {
          await injectAndAssert(
            {
              type: 'dao_committee_vote',
              networkId: currentNetworkId,
              from: committee[i].address,
              proposalId: daoProposalId(proposalN.sc11),
              vote: 'withhold',
              withheldReason: 'Tie regression test',
              timestamp: Date.now(),
            },
            committee[i],
          )
        }
        const proposal = await getProposal(proposalN.sc11)
        assert(proposal.status === 'review', `Expected non-decisive split to remain review, got ${proposal.status}`)
      },
    ],
    [
      '11.3 committee_result advances tied proposal to voting after reviewEnd',
      async () => {
        const proposalBefore = await getProposal(proposalN.sc11)
        await sleepUntilTimestamp(proposalBefore.reviewEnd, 'reviewEnd', SLEEP_BUFFER_MS)
        await injectAndAssert(
          { type: 'dao_committee_result', networkId: currentNetworkId, from: proposer9.address, proposalId: daoProposalId(proposalN.sc11), timestamp: Date.now() },
          proposer9,
        )
        const proposal = await getProposal(proposalN.sc11)
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
    setupSteps: [
    [
      '12.1 Create proposal for time-decay/spend-boost checks',
      async () => {
        setProposalN('sc12', await createDaoProposal({
          proposer: proposer5,
          title: 'Vote timing and spend boost',
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
        await committeeAcceptToVoting(proposalN.sc12, proposer5, committee, SLEEP_BUFFER_MS, [1, 3, 4])
      },
    ],
    [
      '12.3 Early/min, early/high, and late/min votes show expected relative weights',
      async () => {
        const earlyMin = await castVote(proposalN.sc12, voter9, [1, 0], minVoteSpendLib)
        const earlyHigh = await castVote(proposalN.sc12, voter10, [1, 0], minVoteSpendLib * 3)
        const proposalBeforeLate = await getProposal(proposalN.sc12)
        await sleepUntilTimestamp(proposalBeforeLate.votingStart + Math.floor(proposalBeforeLate.votingDuration * 0.75), 'late second-half vote point', SLEEP_BUFFER_MS)
        const lateMin = await castVote(proposalN.sc12, voter11, [1, 0], minVoteSpendLib)
        const earlyMinWeight = asBigInt(earlyMin.receipt.additionalInfo.optionWeights[0])
        const earlyHighWeight = asBigInt(earlyHigh.receipt.additionalInfo.optionWeights[0])
        const lateMinWeight = asBigInt(lateMin.receipt.additionalInfo.optionWeights[0])
        assert(lateMinWeight < earlyMinWeight, `Expected late min vote ${lateMinWeight} < early min vote ${earlyMinWeight}`)
        assert(earlyHighWeight > earlyMinWeight * 3n, `Expected spend boost to be disproportionate: high=${earlyHighWeight}, min=${earlyMinWeight}`)
      },
    ],
    [
      '12.4 Finalize and verify three time-weighted claims',
      async () => {
        await finalizeVote(proposalN.sc12, proposer5, SLEEP_BUFFER_MS)
        const claimedSoFar = await claimAndAssertRewards(proposalN.sc12, [voter9, voter10, voter11])
        const proposal = await getProposal(proposalN.sc12)
        assert(asBigInt(proposal.claimedReward) === claimedSoFar, `Expected claimedReward ${claimedSoFar}, got ${proposal.claimedReward}`)
        assert(claimedSoFar <= asBigInt(proposal.voterRewardPool), `Claimed ${claimedSoFar} exceeds voterRewardPool ${proposal.voterRewardPool}`)
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
    setupSteps: [
    [
      '13.1 Create live voting proposal for rejection checks',
      async () => {
        setProposalN('sc13', await createDaoProposal({
          proposer: proposer10,
          title: 'Validation rejection sweep',
          description: 'Validation sweep proposal',
          changes: [{ key: 'pctBurned', value: '58', current: '50' }],
          gracePeriodMs: graceDurationMs,
        }))
        saveCurrentRunState()
      },
    ],
    [
      '13.2 Reject proposal with too many options',
      async () => {
        await expectProposalCreateReject(
          proposalNumber => ({
            type: 'dao_proposal_create',
            networkId: currentNetworkId,
            from: proposer10.address,
            proposalId: daoProposalId(proposalNumber),
            metaId: daoMetaId(),
            proposalType: 'governance',
            emergency: false,
            title: 'Too many options',
            description: 'Too many options rejection',
            options: ['yes', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10'],
            gracePeriod: graceDurationMs,
            governance: { changes: [{ key: 'pctBurned', value: '59', current: '50' }] },
            timestamp: Date.now(),
          }),
          proposer10,
        )
      },
    ],
    ],
    bodySteps: [
    [
      '13.3 Advance proposal to voting',
      async () => {
        await committeeAcceptToVoting(proposalN.sc13, proposer10, committee, SLEEP_BUFFER_MS, [0, 1, 4])
      },
    ],
    [
      '13.4 dao_vote validation failures are rejected',
      async () => {
        const voter12Balance = await getBalance(voter12.address)
        assert(voter12Balance !== null, `Expected voter12 account to exist before overspend validation`)
        const cases = [
          { name: 'length mismatch', weights: [1, 0, 0], spend: libToWei(minVoteSpendLib), reason: 'length' },
          { name: 'all zero', weights: [0, 0], spend: libToWei(minVoteSpendLib), reason: 'positive weight' },
          { name: 'negative weight', weights: [1, -1], spend: libToWei(minVoteSpendLib), reason: undefined },
          { name: 'below minimum spend', weights: [1, 0], spend: 1n, reason: 'minimum required' },
          { name: 'spend upper bound', weights: [1, 0], spend: voter12Balance + 1n, reason: 'exceeds account balance' },
        ]
        for (const c of cases) {
          await injectExpectReject(
            {
              type: 'dao_vote',
              networkId: currentNetworkId,
              from: voter12.address,
              proposalId: daoProposalId(proposalN.sc13),
              weights: c.weights,
              spend: c.spend,
              timestamp: Date.now(),
            },
            voter12,
            c.reason,
          )
        }
      },
    ],
    [
      '13.5 Accepted proposal still rejects apply before grace period',
      async () => {
        await castVote(proposalN.sc13, voter11, [1, 0], minVoteSpendLib)
        await finalizeVote(proposalN.sc13, proposer10, SLEEP_BUFFER_MS)
        const matchesRejectedChange = (change: any) => String(change?.appData?.dao?.pctBurned) === '58'
        const matchingChangesBefore = (await getProposalListOfChanges()).filter(matchesRejectedChange).length
        await injectExpectReject(
          { type: 'dao_apply_parameters', networkId: currentNetworkId, from: proposer10.address, proposalId: daoProposalId(proposalN.sc13), timestamp: Date.now() },
          proposer10,
          'Grace period',
        )
        const proposalAfter = await getProposal(proposalN.sc13)
        const matchingChangesAfter = (await getProposalListOfChanges()).filter(matchesRejectedChange).length
        assert(proposalAfter.status === 'accepted', `Early apply attempt changed proposal status to ${proposalAfter.status}`)
        assert(matchingChangesAfter === matchingChangesBefore, 'Early apply attempt unexpectedly queued pctBurned=58')
      },
    ],
    [
      '13.6 GET /dao/proposals/:id rejects non-integer, zero, and unsafe-integer IDs',
      async () => {
        const opts = { validateStatus: () => true }
        const badStr    = await apiGet('/dao/proposals/abc',                opts)
        assert(badStr.status === 400,    `Expected /dao/proposals/abc → 400, got ${badStr.status}`)
        const badMix    = await apiGet('/dao/proposals/1abc',               opts)
        assert(badMix.status === 400,    `Expected /dao/proposals/1abc → 400, got ${badMix.status}`)
        const badZero   = await apiGet('/dao/proposals/0',                  opts)
        assert(badZero.status === 400,   `Expected /dao/proposals/0 → 400, got ${badZero.status}`)
        const badBig    = await apiGet('/dao/proposals/9007199254740992',   opts)
        assert(badBig.status === 400,    `Expected /dao/proposals/9007199254740992 → 400, got ${badBig.status}`)
      },
    ],
    ],
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Scenario 14 — Emergency decisive withhold during review
  // ─────────────────────────────────────────────────────────────────────────
  const sc14: ScenarioDef = {
    num: 14,
    name: 'Scenario 14 — Emergency decisive withhold during review',
    setupSteps: [
    [
      '14.1 Create emergency proposal for decisive withhold',
      async () => {
        setProposalN('sc14EmergencyWithhold', await createDaoProposal({
          proposer: committee[1],
          emergency: true,
          title: 'Emergency committee withhold',
          description: 'Emergency decisive withhold test',
          changes: [{ key: 'pctBurned', value: '61', current: '50' }],
          gracePeriodMs: 0,
        }))
        saveCurrentRunState()
        const proposal = await getProposal(proposalN.sc14EmergencyWithhold)
        assert(proposal.status === 'review', `Expected status 'review', got '${proposal.status}'`)
        assert(proposal.emergency === true, 'Expected emergency proposal')
        assert(asBigInt(proposal.voterRewardPool) === 0n, `Expected fee-exempt emergency voterRewardPool 0n, got ${proposal.voterRewardPool}`)
        assertBurnFields(proposal, { initial: 'zero', final: 'zero' })
      },
    ],
    ],
    bodySteps: [
    [
      '14.2 Three emergency withhold votes immediately set status withheld',
      async () => {
        for (const i of [0, 2, 3]) {
          await injectAndAssert(
            {
              type: 'dao_committee_vote',
              networkId: currentNetworkId,
              from: committee[i].address,
              proposalId: daoProposalId(proposalN.sc14EmergencyWithhold),
              vote: 'withhold',
              withheldReason: 'Emergency withhold E2E test',
              timestamp: Date.now(),
            },
            committee[i],
          )
        }
        const proposal = await getProposal(proposalN.sc14EmergencyWithhold)
        assert(proposal.status === 'withheld', `Expected emergency proposal to be withheld immediately, got ${proposal.status}`)
      },
    ],
    [
      '14.3 Emergency withheld burn fields remain zero',
      async () => {
        const proposal = await getProposal(proposalN.sc14EmergencyWithhold)
        assert(asBigInt(proposal.voterRewardPool) === 0n, `Expected voterRewardPool 0n, got ${proposal.voterRewardPool}`)
        assertBurnFields(proposal, { initial: 'zero', final: 'zero' })
      },
    ],
    [
      '14.4 committee_result rejected for already-withheld emergency proposal',
      async () => {
        await injectExpectReject(
          {
            type: 'dao_committee_result',
            networkId: currentNetworkId,
            from: voter13.address,
            proposalId: daoProposalId(proposalN.sc14EmergencyWithhold),
            timestamp: Date.now(),
          },
          voter13,
          'current: withheld',
        )
      },
    ],
    [
      '14.5 dao_burn_reward rejected for withheld emergency proposal',
      async () => {
        await injectExpectReject(
          {
            type: 'dao_burn_reward',
            networkId: currentNetworkId,
            from: voter13.address,
            proposalId: daoProposalId(proposalN.sc14EmergencyWithhold),
            timestamp: Date.now(),
          },
          voter13,
          'already burned',
        )
        const proposal = await getProposal(proposalN.sc14EmergencyWithhold)
        assertBurnFields(proposal, { final: 'zero' })
      },
    ],
    ],
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Scenario 15 — Extended validation/rejection sweep
  // ─────────────────────────────────────────────────────────────────────────
  const sc15: ScenarioDef = {
    num: 15,
    name: 'Scenario 15 — Extended validation/rejection sweep',
    setupSteps: [
    [
      '15.1 Future startTime proposal rejects early committee vote',
      async () => {
        setProposalN('sc15A', await createDaoProposal({
          proposer: proposer3,
          title: 'Future-start validation',
          description: 'Extended validation future startTime proposal',
          changes: [{ key: 'pctBurned', value: '62', current: '50' }],
          gracePeriodMs: graceDurationMs,
          startTime: nowPlus(10_000),
        }))
        saveCurrentRunState()
        await injectExpectReject(
          {
            type: 'dao_committee_vote',
            networkId: currentNetworkId,
            from: committee[4].address,
            proposalId: daoProposalId(proposalN.sc15A),
            vote: 'accept',
            timestamp: Date.now(),
          },
          committee[4],
          'has not started',
        )
      },
    ],
    ],
    bodySteps: [
    [
      '15.2 Committee vote after reviewEnd is rejected',
      async () => {
        const proposalBefore = await getProposal(proposalN.sc15A)
        await sleepUntilTimestamp(proposalBefore.reviewEnd, 'reviewEnd', SLEEP_BUFFER_MS)
        await injectExpectReject(
          {
            type: 'dao_committee_vote',
            networkId: currentNetworkId,
            from: committee[4].address,
            proposalId: daoProposalId(proposalN.sc15A),
            vote: 'accept',
            timestamp: Date.now(),
          },
          committee[4],
          'review period has ended',
        )
      },
    ],
    [
      '15.3 Withhold vote requires non-empty withheldReason',
      async () => {
        await injectExpectReject(
          {
            type: 'dao_committee_vote',
            networkId: currentNetworkId,
            from: committee[4].address,
            proposalId: daoProposalId(proposalN.sc15A),
            vote: 'withhold',
            timestamp: Date.now(),
          },
          committee[4],
          'withheldReason',
        )
        await injectExpectReject(
          {
            type: 'dao_committee_vote',
            networkId: currentNetworkId,
            from: committee[4].address,
            proposalId: daoProposalId(proposalN.sc15A),
            vote: 'withhold',
            withheldReason: '',
            timestamp: Date.now(),
          },
          committee[4],
          'withheldReason',
        )
      },
    ],
    [
      '15.4 Proposal-create validation rejections',
      async () => {
        const lowBalanceAccount = makeAccount()
        await fundAccount(lowBalanceAccount, 1)
        const cases = [
          {
            title: 'Invalid affirmative option',
            description: 'Invalid affirmative option test',
            account: proposer3,
            options: ['no', 'yes'],
            gracePeriod: graceDurationMs,
            changes: [{ key: 'pctBurned', value: '63', current: '50' }],
            reason: 'options[0]',
          },
          {
            title: '   ',
            description: 'Whitespace-only title test',
            account: proposer3,
            options: ['yes', 'no'],
            gracePeriod: graceDurationMs,
            changes: [{ key: 'pctBurned', value: '63', current: '50' }],
            reason: 'title',
          },
          {
            title: 'x'.repeat(101),
            description: 'Excessive title length test',
            account: proposer3,
            options: ['yes', 'no'],
            gracePeriod: graceDurationMs,
            changes: [{ key: 'pctBurned', value: '63', current: '50' }],
            reason: 'title',
          },
          {
            title: 'Duplicate parameter change',
            description: 'Duplicate changes key test',
            account: proposer3,
            options: ['yes', 'no'],
            gracePeriod: graceDurationMs,
            changes: [{ key: 'pctBurned', value: '63', current: '50' }, { key: 'pctBurned', value: '64', current: '50' }],
            reason: 'duplicate "pctBurned"',
          },
          {
            title: 'Excessive grace period',
            description: 'Excessive grace period test',
            account: proposer3,
            options: ['yes', 'no'],
            gracePeriod: graceDurationMs + 1,
            changes: [{ key: 'pctBurned', value: '63', current: '50' }],
            reason: 'exceeds the maximum',
          },
          {
            title: 'Insufficient proposal balance',
            description: 'Insufficient proposal fee balance test',
            account: lowBalanceAccount,
            options: ['yes', 'no'],
            gracePeriod: graceDurationMs,
            changes: [{ key: 'pctBurned', value: '63', current: '50' }],
            reason: 'Insufficient balance',
          },
        ]

        for (const c of cases) {
          await expectProposalCreateReject(
            proposalNumber => ({
              type: 'dao_proposal_create',
              networkId: currentNetworkId,
              from: c.account.address,
              proposalId: daoProposalId(proposalNumber),
              metaId: daoMetaId(),
              proposalType: 'governance',
              emergency: false,
              title: c.title,
              description: c.description,
              options: c.options,
              gracePeriod: c.gracePeriod,
              governance: { changes: c.changes },
              timestamp: Date.now(),
            }),
            c.account,
            c.reason,
          )
        }
      },
    ],
    [
      '15.5 dao_burn_reward before claimEnd is rejected',
      async () => {
        setProposalN('sc15B', await createDaoProposal({
          proposer: proposer3,
          title: 'Early burn validation',
          description: 'Extended validation burn before claimEnd proposal',
          changes: [{ key: 'pctBurned', value: '64', current: '50' }],
          gracePeriodMs: graceDurationMs,
        }))
        saveCurrentRunState()
        await committeeAcceptToVoting(proposalN.sc15B, proposer3, committee, SLEEP_BUFFER_MS, [0, 2, 4])
        await castVote(proposalN.sc15B, voter13, [1, 0], minVoteSpendLib)
        await finalizeVote(proposalN.sc15B, proposer3, SLEEP_BUFFER_MS)
        await injectExpectReject(
          {
            type: 'dao_burn_reward',
            networkId: currentNetworkId,
            from: voter14.address,
            proposalId: daoProposalId(proposalN.sc15B),
            timestamp: Date.now(),
          },
          voter14,
          'Claim period has not ended yet',
        )
      },
    ],
    [
      '15.6 dao_claim_reward after claimEnd is rejected',
      async () => {
        const proposalBefore = await getProposal(proposalN.sc15B)
        await sleepUntilTimestamp(proposalBefore.claimEnd, 'claimEnd', SLEEP_BUFFER_MS)
        await injectExpectReject(
          {
            type: 'dao_claim_reward',
            networkId: currentNetworkId,
            from: voter13.address,
            proposalId: daoProposalId(proposalN.sc15B),
            timestamp: Date.now(),
          },
          voter13,
          'Claim period has ended',
        )
      },
    ],
    [
      '15.7 Invalid committeeAddresses proposal creation is rejected',
      async () => {
        const daoParams = await getDaoParameters()
        const invalidCommitteeAddresses = [committee[0].address]
        await expectProposalCreateReject(
          proposalNumber => ({
            type: 'dao_proposal_create',
            networkId: currentNetworkId,
            from: proposer3.address,
            proposalId: daoProposalId(proposalNumber),
            metaId: daoMetaId(),
            proposalType: 'governance',
            emergency: false,
            title: 'Invalid committee addresses',
            description: 'Invalid committeeAddresses validation proposal',
            options: ['yes', 'no'],
            gracePeriod: graceDurationMs,
            governance: {
              changes: [{ key: 'committeeAddresses', value: JSON.stringify(invalidCommitteeAddresses), current: JSON.stringify(daoParams.committeeAddresses) }],
            },
            timestamp: Date.now(),
          }),
          proposer3,
          'committeeAddresses must contain between',
        )
      },
    ],
    ],
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Scenario 16 — Emergency no-decisive-result timeout
  // ─────────────────────────────────────────────────────────────────────────
  const sc16: ScenarioDef = {
    num: 16,
    name: 'Scenario 16 — Emergency no-decisive-result timeout',
    setupSteps: [
    [
      '16.1 Create emergency proposal for no-decisive-result timeout',
      async () => {
        setProposalN('sc16EmergencyTimeout', await createDaoProposal({
          proposer: committee[4],
          emergency: true,
          title: 'Emergency review timeout',
          description: 'Emergency non-decisive committee result test',
          changes: [{ key: 'pctBurned', value: '65', current: '50' }],
          gracePeriodMs: 0,
        }))
        saveCurrentRunState()
        const proposal = await getProposal(proposalN.sc16EmergencyTimeout)
        assert(proposal.status === 'review', `Expected status 'review', got '${proposal.status}'`)
        assert(asBigInt(proposal.voterRewardPool) === 0n, `Expected voterRewardPool 0n, got ${proposal.voterRewardPool}`)
        assertBurnFields(proposal, { initial: 'zero', final: 'zero' })
      },
    ],
    ],
    bodySteps: [
    [
      '16.2 Non-decisive emergency committee split leaves status review',
      async () => {
        await injectAndAssert(
          { type: 'dao_committee_vote', networkId: currentNetworkId, from: committee[4].address, proposalId: daoProposalId(proposalN.sc16EmergencyTimeout), vote: 'accept', timestamp: Date.now() },
          committee[4],
        )
        await injectAndAssert(
          {
            type: 'dao_committee_vote',
            networkId: currentNetworkId,
            from: committee[2].address,
            proposalId: daoProposalId(proposalN.sc16EmergencyTimeout),
            vote: 'withhold',
            withheldReason: 'Emergency timeout split test',
            timestamp: Date.now(),
          },
          committee[2],
        )
        const proposal = await getProposal(proposalN.sc16EmergencyTimeout)
        assert(proposal.status === 'review', `Expected non-decisive emergency split to remain review, got ${proposal.status}`)
      },
    ],
    [
      '16.3 committee_result after reviewEnd withholds non-decisive emergency proposal',
      async () => {
        const proposalBefore = await getProposal(proposalN.sc16EmergencyTimeout)
        await sleepUntilTimestamp(proposalBefore.reviewEnd, 'reviewEnd', SLEEP_BUFFER_MS)
        await injectAndAssert(
          { type: 'dao_committee_result', networkId: currentNetworkId, from: voter14.address, proposalId: daoProposalId(proposalN.sc16EmergencyTimeout), timestamp: Date.now() },
          voter14,
        )
        const proposal = await getProposal(proposalN.sc16EmergencyTimeout)
        assert(proposal.status === 'withheld', `Expected emergency proposal withheld after non-decisive reviewEnd, got ${proposal.status}`)
        assert(asBigInt(proposal.voterRewardPool) === 0n, `Expected voterRewardPool 0n, got ${proposal.voterRewardPool}`)
        assertBurnFields(proposal, { initial: 'zero', final: 'zero' })
      },
    ],
    [
      '16.4 dao_apply_parameters rejects withheld emergency proposal',
      async () => {
        await injectExpectReject(
          {
            type: 'dao_apply_parameters',
            networkId: currentNetworkId,
            from: voter16.address,
            proposalId: daoProposalId(proposalN.sc16EmergencyTimeout),
            timestamp: Date.now(),
          },
          voter16,
          'accepted status',
        )
      },
    ],
    ],
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Scenario 17 — dao_unapply_parameters committee recovery
  // ─────────────────────────────────────────────────────────────────────────
  const sc17: ScenarioDef = {
    num: 17,
    name: 'Scenario 17 — dao_unapply_parameters committee recovery',
    setupSteps: [
    [
      '17.1 Create emergency proposal for unapply recovery test',
      async () => {
        // Query rather than assume 3 — the flag may have been changed on this network.
        sc17UnapplyThreshold = await getEffectiveUnapplyThreshold(committee.length)
        assert(
          Number.isInteger(sc17UnapplyThreshold) && sc17UnapplyThreshold >= 1 && sc17UnapplyThreshold <= committee.length,
          `Expected effective unapply threshold in [1, ${committee.length}], got ${sc17UnapplyThreshold}`,
        )
        const daoParams = await getDaoParameters()
        const currentVoteThresholdUsd = String(daoParams.voteThresholdUsdStr)
        sc17VoteThresholdUsdTarget = currentVoteThresholdUsd === '150.0' ? '100.0' : '150.0'
        setProposalN('sc17EmergencyRecovery', await createDaoProposal({
          proposer: committee[3],
          emergency: true,
          title: 'Emergency parameter recovery',
          description: `Emergency unapply-recovery test toggles voteThresholdUsdStr from ${currentVoteThresholdUsd} to ${sc17VoteThresholdUsdTarget}`,
          changes: [{ key: 'voteThresholdUsdStr', value: sc17VoteThresholdUsdTarget, current: currentVoteThresholdUsd }],
          gracePeriodMs: 0,
        }))
        saveCurrentRunState()
        const proposal = await getProposal(proposalN.sc17EmergencyRecovery)
        assert(proposal.status === 'review', `Expected status 'review', got '${proposal.status}'`)
        assert(proposal.emergency === true, 'Expected emergency === true')
      },
    ],
    ],
    bodySteps: [
    [
      '17.2 committee_vote accept x3 → accepted (emergency skips community voting)',
      async () => {
        for (const i of [3, 4, 0]) {
          await injectAndAssert(
            {
              type: 'dao_committee_vote',
              networkId: currentNetworkId,
              from: committee[i].address,
              proposalId: daoProposalId(proposalN.sc17EmergencyRecovery),
              vote: 'accept',
              timestamp: Date.now(),
            },
            committee[i],
          )
        }
        const proposal = await getProposal(proposalN.sc17EmergencyRecovery)
        assert(proposal.status === 'accepted', `Expected status 'accepted' for emergency, got '${proposal.status}'`)
      },
    ],
    [
      '17.3 dao_apply_parameters from committee member → applied immediately (no grace period)',
      async () => {
        // Routed through applyAcceptedProposal (not injectAndAssert directly) so this emergency
        // proposal actually exercises the applyEligibleAt-skip branch in that shared helper.
        const { receipt } = await applyAcceptedProposal(proposalN.sc17EmergencyRecovery, committee[0], SLEEP_BUFFER_MS)
        await waitForNetworkParameter(['current', 'dao', 'voteThresholdUsdStr'], sc17VoteThresholdUsdTarget, applyParamsPollMs)
        // Deep-equality match the exact queued change object (not just one field) against
        // listOfChanges — proves what was queued is what actually landed.
        const receiptChange = receipt.additionalInfo.change
        await waitForListOfChangesFromReceipt(
          `exact receipt.additionalInfo.change at cycle ${receiptChange?.cycle}`,
          receipt,
          c => Utils.safeStringify(c) === Utils.safeStringify(receiptChange),
          applyParamsPollMs,
        )
      },
    ],
    [
      '17.4 dao_unapply_parameters rejected from a non-committee sender',
      async () => {
        await injectExpectReject(
          {
            type: 'dao_unapply_parameters',
            networkId: currentNetworkId,
            from: voter5.address,
            proposalId: daoProposalId(proposalN.sc17EmergencyRecovery),
            timestamp: Date.now(),
          },
          voter5,
          'committee member',
        )
        const proposal = await getProposal(proposalN.sc17EmergencyRecovery)
        assert(proposal.status === 'applied', `Expected status still 'applied' after rejected sender, got '${proposal.status}'`)
      },
    ],
    [
      '17.5 dao_unapply_parameters votes accumulate to the live threshold, status flips to accepted',
      async () => {
        // Drives exactly sc17UnapplyThreshold votes (queried in 17.1), not a hardcoded 3.
        for (let i = 0; i < sc17UnapplyThreshold; i++) {
          const isLastVote = i === sc17UnapplyThreshold - 1
          const { receipt } = await injectAndAssert(
            {
              type: 'dao_unapply_parameters',
              networkId: currentNetworkId,
              from: committee[i].address,
              proposalId: daoProposalId(proposalN.sc17EmergencyRecovery),
              timestamp: Date.now(),
            },
            committee[i],
            { expectedBalanceDelta: receipt => -asBigInt(receipt.transactionFee ?? 0n) },
          )
          assert(receipt.additionalInfo.unapplyVoteCount === i + 1, `Expected unapplyVoteCount ${i + 1}, got ${receipt.additionalInfo.unapplyVoteCount}`)
          assert(receipt.additionalInfo.thresholdReached === isLastVote, `Expected thresholdReached ${isLastVote}, got ${receipt.additionalInfo.thresholdReached}`)
          // Checked on every vote, including the threshold-reaching one: unlike
          // dao_apply_parameters, this receipt literal never has a "change" key.
          assert(receipt.additionalInfo.change === undefined, `dao_unapply_parameters must not queue a global change, got ${JSON.stringify(receipt.additionalInfo.change)}`)

          const proposal = await getProposal(proposalN.sc17EmergencyRecovery)
          if (isLastVote) {
            assert(receipt.additionalInfo.proposalStatus === 'accepted', `Expected receipt proposalStatus 'accepted', got '${receipt.additionalInfo.proposalStatus}'`)
            assert(proposal.status === 'accepted', `Expected status 'accepted' after threshold reached, got '${proposal.status}'`)
            assert(
              !Array.isArray(proposal.unapplyVotes) || proposal.unapplyVotes.length === 0,
              `Expected unapplyVotes reset to empty after threshold, got ${JSON.stringify(proposal.unapplyVotes)}`,
            )
          } else {
            assert(proposal.status === 'applied', `Expected status still 'applied' after vote #${i + 1}, got '${proposal.status}'`)
          }

          // No param drift: checked unconditionally, including after the threshold-reaching
          // vote — the one that changes proposal status is the most important to verify here.
          const daoParams = await getDaoParameters()
          assert(
            String(daoParams?.voteThresholdUsdStr) === String(sc17VoteThresholdUsdTarget),
            `Expected voteThresholdUsdStr to remain ${sc17VoteThresholdUsdTarget} during unapply, got ${daoParams?.voteThresholdUsdStr}`,
          )

          // Tested right after vote #1, while status is still 'applied', so the rejection is
          // unambiguously about the duplicate and not the wrong-status path (17.6). Skipped if
          // threshold is 1, since there's no 'applied' window left to test it in isolation.
          if (i === 0 && !isLastVote) {
            await injectExpectReject(
              {
                type: 'dao_unapply_parameters',
                networkId: currentNetworkId,
                from: committee[0].address,
                proposalId: daoProposalId(proposalN.sc17EmergencyRecovery),
                timestamp: Date.now(),
              },
              committee[0],
              'already submitted',
            )
            const proposalAfterDuplicate = await getProposal(proposalN.sc17EmergencyRecovery)
            assert(proposalAfterDuplicate.status === 'applied', `Expected status still 'applied' after duplicate reject, got '${proposalAfterDuplicate.status}'`)
          }
        }
      },
    ],
    [
      '17.6 dao_unapply_parameters rejected once proposal is no longer applied',
      async () => {
        await injectExpectReject(
          {
            type: 'dao_unapply_parameters',
            networkId: currentNetworkId,
            from: committee[1].address,
            proposalId: daoProposalId(proposalN.sc17EmergencyRecovery),
            timestamp: Date.now(),
          },
          committee[1],
          'not in applied status',
        )
      },
    ],
    [
      '17.7 Re-apply dao_apply_parameters after recovery — status returns to applied',
      async () => {
        const { receipt } = await injectAndAssert(
          {
            type: 'dao_apply_parameters',
            networkId: currentNetworkId,
            from: committee[0].address,
            proposalId: daoProposalId(proposalN.sc17EmergencyRecovery),
            timestamp: Date.now(),
          },
          committee[0],
        )
        const proposal = await getProposal(proposalN.sc17EmergencyRecovery)
        assert(proposal.status === 'applied', `Expected status 'applied' after re-apply, got '${proposal.status}'`)

        // Proves the loop closes: the re-apply gets its own fresh cycle, so this can't
        // accidentally match the first apply's already-landed entry from 17.3.
        const receiptChange = receipt.additionalInfo.change
        await waitForListOfChangesFromReceipt(
          `exact receipt.additionalInfo.change at cycle ${receiptChange?.cycle} (re-apply)`,
          receipt,
          c => Utils.safeStringify(c) === Utils.safeStringify(receiptChange),
          applyParamsPollMs,
        )
      },
    ],
    ],
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Run scenarios — sequential (default) or parallel (--parallel flag)
  // ─────────────────────────────────────────────────────────────────────────
  const scenarios = [sc1, sc2, sc3, sc4, sc5, sc6, sc7, sc8, sc9, sc10, sc11, sc12, sc13, sc14, sc15, sc16, sc17]
  validateScenarioCatalog(scenarios)
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
  if (scenarioTimings.length > 0) {
    console.log('─'.repeat(64))
    for (const timing of [...scenarioTimings].sort((a, b) => a.num - b.num)) {
      console.log(`  S${String(timing.num).padEnd(2)} ${timing.name.padEnd(58)} ${(timing.ms / 1000).toFixed(1)}s`)
    }
  }
  console.log('═'.repeat(64))
  const totalSec = (totalMs / 1000).toFixed(0)
  const wallSec = ((Date.now() - runStartedAt) / 1000).toFixed(0)
  console.log(
    `  Passed: ${passed} / ${results.length}   Failed: ${failed}   Skipped: ${skipped}`,
  )
  console.log(`  Step time: ~${totalSec}s cumulative   Wall time: ~${wallSec}s`)
  console.log('═'.repeat(64))
  writeSummary(failed > 0 ? 'fail' : 'pass')
  console.log(`Logs saved:\n  App:      ${logFile}\n  Terminal: ${terminalLogFile}\n  Summary:  ${summaryFile}`)

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
  writeSummary('fatal', err)
  closeLog()
  _origLog(`Logs saved:\n  App:      ${logFile}\n  Terminal: ${terminalLogFile}\n  Summary:  ${summaryFile}`)
  process.exit(1)
})
