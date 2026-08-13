import type { Shardus } from '@shardus/core'
import * as crypto from '../crypto'
import { DaoProposalAccount, DaoProposalIndexEntry, DaoProposalsMeta, DaoProposalStatus } from '../@types'
import { isDaoProposalAccount, isDaoProposalsMeta } from '../@types/accountTypeGuards'

/**
 * Normalizes the optional `proposals` array in place and returns it.
 *
 * `proposals` is optional so DaoProposalsMeta accounts serialized before the index existed still
 * deserialize. That means the first post-upgrade transaction can see `undefined`, so every read
 * path must go through here rather than dereferencing `meta.proposals` directly.
 */
export function getProposalIndex(meta: DaoProposalsMeta): DaoProposalIndexEntry[] {
  // Handlers reach the meta account through a derived address, so a wrong-type account here should
  // be unreachable. Assert once at the shared entry point rather than in all seven callers: it
  // makes the assumption explicit and turns an impossible-but-catastrophic case into a clear error
  // instead of a TypeError three lines later.
  if (!isDaoProposalsMeta(meta)) {
    throw new Error('daoProposalIndex: account is not a DaoProposalsMeta')
  }
  if (!Array.isArray(meta.proposals)) meta.proposals = []
  return meta.proposals
}

/**
 * Safety ceiling on a single backfill batch. Not configurable — there is no flag for this.
 *
 * The batch is fetched concurrently, so this is a bound on simultaneous in-flight account fetches
 * inside a consensus-bound apply(), not on wall time. It is deliberately well above any realistic
 * pre-upgrade proposal count (devnet has 40), so in practice a network fills its whole index on the
 * first creation after upgrading. It exists only so a pathologically large history cannot open
 * thousands of sockets at once; such a network simply converges over a few creations instead.
 */
const MAX_BACKFILL_BATCH_SIZE = 50

/**
 * Returns the proposal numbers missing from the index, oldest first.
 *
 * Two things this deliberately does NOT do:
 *
 * 1. It never returns `meta.count` itself. During dao_proposal_create, `count` has already been
 *    incremented for the proposal being created, whose account is not committed yet and exists only
 *    in wrappedStates. Fetching it would always fail, and since the batch is all-or-nothing that
 *    would abort every backfill forever.
 * 2. It does not derive the set from `proposals.length`. The historical batch is optional while new
 *    proposals are always indexed, so the array can legitimately hold #45 while #1..#30 are absent.
 *    Only the actual entry numbers say what is missing.
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
 * Orders index entries most-recent-first, breaking ties by descending proposal number.
 *
 * Proposal numbers are unique, so this is a total order — no two entries can compare equal, which
 * means the result never depends on the sort implementation's stability. That matters: the array is
 * consensus-visible, so every node must produce byte-identical output.
 */
export function compareIndexEntries(a: DaoProposalIndexEntry, b: DaoProposalIndexEntry): number {
  return b.timestamp - a.timestamp || b.proposal - a.proposal
}

/**
 * Records a proposal's status in the meta account's index.
 *
 * Upserts by proposal number, stamps the entry with the transaction's timestamp, and re-sorts the
 * array most-recent-first (see compareIndexEntries). Sorting rather than front-inserting is what
 * lets backfill add historical entries without breaking the ordering.
 *
 * Callers own the "did the status actually change" decision — this helper does not try to detect
 * no-ops, because a legitimate re-insert is indistinguishable from one. Handlers must capture
 * `previousStatus` before mutating and only call this when it differs.
 *
 * Must stay deterministic: every node runs this on the same inputs and the resulting array is
 * consensus-visible, so no Date.now(), no unstable sort, no iteration-order dependence.
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

  // Sort rather than unshift: a live transition always carries the newest timestamp and would land
  // at the front either way, but backfill inserts historical entries whose timestamps are older
  // than entries already present. Sorting keeps the documented most-recent-first invariant true for
  // both callers, and is self-healing if an array ever arrives out of order.
  proposals.sort(compareIndexEntries)

  // No cap today — see decision 3 in DAO_PROPOSAL_META_SUMMARY_PLAN.md. When one is added it goes
  // here: proposals.length = Math.min(proposals.length, cap).

  // Required, not cosmetic: src/index.ts only emits accounts whose timestamp equals txTimestamp,
  // so without this the mutation above is silently dropped and never persisted.
  meta.timestamp = txTimestamp
}

/**
 * Fills historical proposals into the index until it is complete.
 *
 * NOT CURRENTLY CALLED — the one call site, in dao_proposal_create.apply(), is commented out.
 * Kept here, live and tested, so re-enabling is uncommenting that line and its import.
 *
 * Self-limiting: once every proposal 1..count-1 is present, findMissingProposalNumbers returns
 * empty and this becomes a no-op forever.
 *
 * KNOWN AND ACCEPTED: this makes apply() non-deterministic. Handlers normally derive state only
 * from wrappedStates, which Shardus snapshots identically for every node; a network fetch does not
 * have that property, because nodes hold different shards, query different peers, and time out
 * independently. If nodes compute different arrays they submit different
 * AppliedVote.account_state_hash_after values, no majority forms, and the transaction fails
 * consensus. That is a reliability cost, not a safety one — committed state stays consistent and
 * there is no fork; the visible symptom is dao_proposal_create failing and needing a retry.
 *
 * Two mitigations keep that tolerable, and both matter:
 *
 * - All-or-nothing. A partially applied batch would give every node a different array; abandoning
 *   the whole batch on any failure collapses the outcomes to exactly two (batch applied, or
 *   nothing), so a majority can still agree.
 * - Never wedge creation permanently. The proposal being created is indexed before this runs, so a
 *   batch the whole network agrees to skip costs nothing but the historical entries. The guarantee
 *   is weaker when nodes *disagree*: the receipt fails and the entire transaction, creation
 *   included, has to be resubmitted. What cannot happen is a backfill permanently preventing
 *   proposals from being created — a retry whose fetches agree succeeds, and once the index is
 *   complete this path stops running at all.
 *
 * The fetches cannot hang apply() inside consensus, so no local timeout is added here (and
 * getLocalOrRemoteAccount exposes no timeout parameter to pass one through). Core already bounds
 * each call: stateManager.getLocalOrRemoteAccount reaches a remote node via p2p.askBinary, which
 * hands `network.timeout` (default 5s) to the socket send and rejects on expiry. Because
 * canThrowException defaults to false, state-manager swallows that rejection and returns null,
 * which the `!account` check below treats as a failed batch. The whole batch is issued concurrently,
 * so the worst case is one timeout of added latency however many accounts are missing.
 */
export async function backfillProposalIndex(meta: DaoProposalsMeta, dapp: Shardus): Promise<void> {
  const missing = findMissingProposalNumbers(meta)
  if (missing.length === 0) return

  // Issued concurrently rather than one at a time, and as a single batch rather than chunks spread
  // over successive creations. Convergence is what that buys: a network upgrading with 40 existing
  // proposals fills its entire index on the first creation afterwards.
  //
  // Determinism survives this. Promise.all resolves in input order regardless of completion order,
  // so results map back to `missing` positionally, and recordProposalStatus sorts by the total order
  // in compareIndexEntries anyway — completion order is never observable in the output.
  //
  // Each fetch catches its own failure and yields null rather than rejecting, so one bad account
  // cannot leave the other promises unhandled, and every failure mode lands on the same null check.
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
      // All-or-nothing: one unreachable account abandons the whole batch rather than writing a
      // partial array that no two nodes would agree on. The next creation retries.
      dapp.log('daoProposalIndex: backfill could not read proposal, skipping batch', missing[i])
      return
    }
    // proposal.timestamp means "last touched by any tx", not "last status change" — several
    // handlers bump it without changing status. Backfilled timestamps are therefore approximate,
    // which is accepted; it is the only timestamp reachable from the account and it is
    // deterministic, so every node that reads the account agrees on it.
    // Keyed on the requested number, not account.number: the address was derived from it, so it is
    // the authoritative identity for this entry regardless of what the fetched body says.
    entries.push({ proposal: missing[i], status: account.status, emergency: account.emergency, timestamp: account.timestamp })
  }

  // Apply only after every fetch in the batch succeeded.
  for (const entry of entries) {
    recordProposalStatus(meta, entry.proposal, entry.status, entry.emergency, entry.timestamp)
  }
  // Caller contract: recordProposalStatus stamps meta.timestamp with each entry's timestamp, which
  // here is historical. The calling handler MUST reassign meta.timestamp = txTimestamp after this
  // returns — src/index.ts only persists accounts whose timestamp equals txTimestamp, so without
  // that the whole write is silently dropped. Do not reorder that assignment above the call.
  dapp.log('daoProposalIndex: backfilled proposal index entries', entries.length, 'of', getProposalIndex(meta).length)
}
