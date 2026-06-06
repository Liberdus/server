/**
 * DAO Phase 1 — End-to-End Feature Test Script
 *
 * Manages the full network lifecycle and walks through every DAO scenario.
 * Signs transactions using ethers ECDSA (matching useEthereumAddress: true).
 *
 * Usage:
 *   npm run test:dao:e2e
 *   npm run test:dao:e2e -- --no-start --no-stop   (skip network management)
 *   npm run test:dao:e2e -- --verbose               (print full TX/response bodies)
 *
 * All timing values are read live from the network — nothing is hardcoded.
 * Each run writes a full log to test-logs/dao-e2e-<timestamp>.log.
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
const NO_START = cliArgs.includes('--no-start')
const NO_STOP = cliArgs.includes('--no-stop')
const VERBOSE = cliArgs.includes('--verbose')

const HOST = 'localhost:9001'
const ARCHIVER_HOST = 'localhost:4000'

// ─── Log file setup ───────────────────────────────────────────────────────────

const logDir = path.resolve(__dirname, '../test-logs')
if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true })
const logTimestamp = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').slice(0, 19)
const logFile = path.join(logDir, `dao-e2e-${logTimestamp}.log`)
const logStream = fs.createWriteStream(logFile, { flags: 'w' })

// Intercept console.log so every line goes to both stdout and the log file.
const _origLog = console.log.bind(console)
console.log = (...args: any[]) => {
  const line = args.map(a => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ')
  logStream.write(line + '\n')
  _origLog(...args)
}
const _origError = console.error.bind(console)
console.error = (...args: any[]) => {
  const line = args.map(a => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ')
  logStream.write('[ERROR] ' + line + '\n')
  _origError(...args)
}

console.log(`Log file: ${logFile}`)

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
}

// ─── Global state ─────────────────────────────────────────────────────────────

const results: StepResult[] = []

/**
 * Network ID from the cycle record — set once the network reaches 'processing'
 * mode and included in every TX to pass isValidNetworkId().
 */
let currentNetworkId = ''

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

async function scenario(name: string, steps: Array<[string, () => Promise<void>]>): Promise<void> {
  console.log(`\n── ${name} ──`)
  let failed = false
  for (const [stepName, fn] of steps) {
    if (failed) {
      results.push({ name: stepName, status: 'skip', ms: 0 })
      console.log(`  ⏭   ${stepName} (skipped)`)
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

/**
 * Normalise a bigint field that may come back as bigint, string, or number
 * after Utils.safeStringify / axios JSON parse round-trip.
 */
function asBigInt(value: bigint | string | number): bigint {
  return typeof value === 'bigint' ? value : BigInt(value)
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

/**
 * Sign, inject, and assert success.
 * Posts { tx: Utils.safeStringify(tx) } — /inject reads req.body.tx via safeJsonParse.
 * Handles axios HTTP 4xx by surfacing the response body in the error message.
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
  if (VERBOSE) console.log('  ← Response:', JSON.stringify(res.data))
  assert(res.data.result?.success === true, `TX rejected: ${JSON.stringify(res.data)}`)
  return res.data
}

/**
 * Sign and inject a TX expected to be rejected by the network.
 * Handles axios HTTP 4xx as a valid rejection response.
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
    if (VERBOSE) console.log('  ← Response:', JSON.stringify(res.data))
    result = res.data?.result
  } catch (err: any) {
    if (err.response) {
      if (VERBOSE) console.log('  ← Response (HTTP error):', JSON.stringify(err.response.data))
      result = err.response.data?.result ?? err.response.data
    } else {
      throw err
    }
  }
  assert(result?.success !== true, `Expected TX to be rejected but it succeeded`)
  if (reasonIncludes) {
    const reason: string = result?.reason ?? ''
    assert(
      reason.toLowerCase().includes(reasonIncludes.toLowerCase()),
      `Expected rejection reason to include "${reasonIncludes}", got: "${reason}"`,
    )
  }
}

/**
 * Fetch proposal #n via /dao/proposals/:n (uses safeStringify, handles bigint fields).
 */
async function getProposal(n: number): Promise<DaoProposalAccount> {
  const res = await axios.get(`http://${HOST}/dao/proposals/${n}`)
  const body = safeParse(res.data)
  assert(body?.proposal != null, `Proposal #${n} not found`)
  return body.proposal as DaoProposalAccount
}

/** Query current proposal count so we always use the right sequential number. */
async function nextProposalNumber(): Promise<number> {
  const res = await axios.get(`http://${HOST}/dao/proposals/meta`)
  const body = safeParse(res.data)
  return ((body?.meta?.count ?? 0) as number) + 1
}

/** Inject a 'create' TX to fund an account. Fire-and-forget — caller must wait for settlement. */
async function fundAccount(account: TestAccount, amountLib: number): Promise<void> {
  const tx: any = {
    type: 'create',
    networkId: currentNetworkId,
    from: account.address,
    amount: libToWei(amountLib),
    timestamp: Date.now(),
  }
  await signTx(tx, account)
  let res: any
  try {
    res = await axios.post(`http://${HOST}/inject`, { tx: Utils.safeStringify(tx) })
  } catch (err: any) {
    if (err.response) throw new Error(`Fund TX HTTP ${err.response.status}: ${JSON.stringify(err.response.data)}`)
    throw err
  }
  assert(res.data.result?.success === true, `Fund TX failed: ${JSON.stringify(res.data)}`)
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
  await pollUntil(
    async () => {
      try {
        const res = await axios.get(`http://${HOST}/network/parameters`)
        const dao = res.data?.parameters?.current?.dao
        if (dao?.reviewDuration && dao?.votingDuration) {
          daoParams = dao
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
  const { cycleDurationMs, networkId, reviewDurationMs, votingDurationMs, graceDurationMs } = timing
  currentNetworkId = networkId

  // Derived timing constants
  const applyParamsPollMs = cycleDurationMs * 5   // global message fires at cycle+3
  const fundSettleMs = cycleDurationMs * 2         // wait 2 full cycles for fund TXs
  const SLEEP_BUFFER_MS = 5_000

  // ─────────────────────────────────────────────────────────────────────────
  // Scenario 1 — Happy path: governance proposal → accepted → applied → claimed
  // ─────────────────────────────────────────────────────────────────────────
  await scenario('Scenario 1 — Happy path (governance → accepted → applied → claimed)', [
    [
      '1.1  Fund all accounts',
      async () => {
        await Promise.all([
          fundAccount(proposer, 500),
          fundAccount(voter1, 200),
          fundAccount(voter2, 200),
          ...committee.map(c => fundAccount(c, 50)),
        ])
        console.log(`    Waiting ${fundSettleMs / 1000}s for fund TXs to settle (2 cycles)...`)
        await sleep(fundSettleMs)
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
              changes: [{ key: 'dao.voteExponent', value: '1.2', current: '1.1' }],
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
            spend: libToWei(10),
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
            spend: libToWei(5),
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
          `Expected listOfChanges to contain dao.voteExponent=1.2, got: ${JSON.stringify(listOfChanges)}`,
        )
      },
    ],

    [
      '1.9  dao_claim_reward (voter1 + voter2)',
      async () => {
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
  await scenario('Scenario 2 — Withheld path', [
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
              changes: [{ key: 'dao.pctBurned', value: '60', current: '50' }],
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
  await scenario('Scenario 3 — Auto-accept via committee_result (no committee votes submitted)', [
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
              changes: [{ key: 'dao.pctBurned', value: '55', current: '50' }],
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
  await scenario('Scenario 4 — Emergency proposal path', [
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
              changes: [{ key: 'dao.pctBurned', value: '70', current: '50' }],
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
              changes: [{ key: 'dao.pctBurned', value: '70', current: '50' }],
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
  await scenario('Scenario 5 — Access control & rejection cases', [
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
              changes: [{ key: 'dao.pctBurned', value: '45', current: '50' }],
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
            spend: libToWei(5),
            timestamp: Date.now(),
          },
          voter1,
          'voting',
        )
      },
    ],

    [
      '5.3  Non-voter (proposer) tries dao_claim_reward on applied proposal → rejected',
      async () => {
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

  logStream.end()

  if (!NO_STOP) await stopNetwork()

  process.exit(failed > 0 ? 1 : 0)
}

main().catch(err => {
  console.error('Fatal error:', err)
  logStream.end()
  process.exit(1)
})
