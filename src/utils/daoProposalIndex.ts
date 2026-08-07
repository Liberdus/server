import { DaoProposalIndexEntry, DaoProposalsMeta, DaoProposalStatus } from '../@types'
import { isDaoProposalsMeta } from '../@types/accountTypeGuards'

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
 * 2. It does not derive the set from `proposals.length`. The historical chunk is optional while new
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
