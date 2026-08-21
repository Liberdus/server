import type { Shardus } from '@shardus/core'
import * as crypto from '../crypto'
import { DaoProposalAccount, DaoProposalIndexEntry, DaoProposalsMeta, DaoProposalStatus } from '../@types'
import { isDaoProposalAccount, isDaoProposalsMeta } from '../@types/accountTypeGuards'

/** Hard ceiling on one backfill batch, so a large history cannot open thousands of sockets at once. */
const MAX_BACKFILL_BATCH_SIZE = 50

/**
 * Normalizes the optional `proposals` array in place and returns it.
 *
 * The field is optional so meta accounts serialized before the index existed still deserialize —
 * read it through here rather than dereferencing `meta.proposals` directly.
 */
export function getProposalIndex(meta: DaoProposalsMeta): DaoProposalIndexEntry[] {
  if (!isDaoProposalsMeta(meta)) {
    throw new Error('daoProposalIndex: account is not a DaoProposalsMeta')
  }
  if (!Array.isArray(meta.proposals)) meta.proposals = []
  return meta.proposals
}

/**
 * Proposal numbers missing from the index, oldest first.
 *
 * Deliberately excludes `meta.count` itself: during dao_proposal_create it has already been
 * incremented for the in-flight proposal, whose account is not committed yet. The set comes from
 * actual entry numbers, never `proposals.length` — the array can hold #45 while #1..#30 are absent.
 */
export function findMissingProposalNumbers(meta: DaoProposalsMeta): number[] {
  const present = new Set(getProposalIndex(meta).map((entry) => entry.proposal))
  const missing: number[] = []
  for (let n = 1; n < meta.count && missing.length < MAX_BACKFILL_BATCH_SIZE; n++) {
    if (!present.has(n)) missing.push(n)
  }
  return missing
}

/**
 * Most-recent-first, ties broken by descending proposal number. Numbers are unique, so this is a
 * total order and the result never depends on sort stability — the array is consensus-visible and
 * every node must produce byte-identical output.
 */
export function compareIndexEntries(a: DaoProposalIndexEntry, b: DaoProposalIndexEntry): number {
  return b.timestamp - a.timestamp || b.proposal - a.proposal
}

/**
 * Upserts a proposal's status into the index.
 *
 * Callers own the "did the status actually change" decision — capture `previousStatus` before
 * mutating and only call this when it differs. Must stay deterministic: no Date.now(), no unstable
 * sort, no iteration-order dependence.
 */
export function recordProposalStatus(
  meta: DaoProposalsMeta,
  proposalNumber: number,
  status: DaoProposalStatus,
  emergencyFlag: boolean,
  txTimestamp: number,
): void {
  const proposals = getProposalIndex(meta)

  const existingIndex = proposals.findIndex((entry) => entry.proposal === proposalNumber)
  if (existingIndex !== -1) proposals.splice(existingIndex, 1)

  proposals.push({ proposal: proposalNumber, status, emergencyFlag, timestamp: txTimestamp })

  // Sort rather than unshift: backfill inserts historical entries older than what is already there.
  proposals.sort(compareIndexEntries)

  // Uncapped by design, so a client sees all history. Cost is an O(N) rewrite and re-hash per
  // transition; `proposals.length` is the metric to watch. A cap would go here.

  // Required, not cosmetic: src/index.ts only emits accounts whose timestamp equals txTimestamp,
  // so without this the mutation above is silently dropped.
  meta.timestamp = txTimestamp
}

/**
 * Fills historical proposals into the index. Self-limiting — once 1..count-1 are all present this
 * is a permanent no-op.
 *
 * NOT CURRENTLY CALLED: the one call site in dao_proposal_create.apply() is commented out. Kept
 * live and tested so re-enabling is uncommenting that line and its import.
 *
 * KNOWN AND ACCEPTED: this reads the network instead of wrappedStates, so nodes can compute
 * different arrays, fail to form a majority, and fail the transaction. That is a reliability cost,
 * not a safety one — committed state stays consistent; the symptom is a create needing a retry.
 * All-or-nothing batching is what keeps that tolerable: it collapses the outcomes to two (batch
 * applied, or nothing), so a majority can still agree.
 *
 * Core bounds each fetch via `network.timeout` (5s), and the batch is concurrent, so the worst case
 * is one timeout however many accounts are missing.
 */
export async function backfillProposalIndex(meta: DaoProposalsMeta, dapp: Shardus): Promise<void> {
  const missing = findMissingProposalNumbers(meta)
  if (missing.length === 0) return

  // Promise.all resolves in input order, so completion order is never observable in the output.
  // Each fetch catches its own failure so one bad account cannot leave the others unhandled.
  const wrapped = await Promise.all(
    missing.map(async (proposalNumber) => {
      try {
        return await dapp.getLocalOrRemoteAccount(crypto.hash(`dao proposal #${proposalNumber}`))
      } catch (err) {
        dapp.log('daoProposalIndex: backfill fetch threw', proposalNumber, err)
        return null
      }
    }),
  )

  const entries: Array<{ proposal: number; status: DaoProposalStatus; emergency: boolean; timestamp: number }> = []
  for (let i = 0; i < missing.length; i++) {
    const account = wrapped[i]?.data as DaoProposalAccount
    if (!account || !isDaoProposalAccount(account)) {
      // All-or-nothing: one unreachable account abandons the batch rather than writing a partial
      // array no two nodes would agree on. The next creation retries.
      dapp.log('daoProposalIndex: backfill could not read proposal, skipping batch', missing[i])
      return
    }
    // Keyed on the requested number, since the address was derived from it. `account.timestamp` is
    // "last touched by any tx", so backfilled timestamps are approximate — accepted, and it is the
    // only value here that every node agrees on.
    entries.push({ proposal: missing[i], status: account.status, emergency: account.emergency, timestamp: account.timestamp })
  }

  // Only after every fetch in the batch succeeded.
  for (const entry of entries) {
    recordProposalStatus(meta, entry.proposal, entry.status, entry.emergency, entry.timestamp)
  }
  // Caller contract: the entries above leave meta.timestamp historical. The calling handler MUST
  // reassign meta.timestamp = txTimestamp after this returns, or the whole write is dropped.
  dapp.log('daoProposalIndex: backfilled proposal index entries', entries.length, 'of', getProposalIndex(meta).length)
}
