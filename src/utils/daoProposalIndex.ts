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
 * Orders index entries most-recent-first, breaking ties by descending proposal number.
 *
 * Proposal numbers are unique, so this is a total order — no two entries can compare equal, which
 * means the result never depends on the sort implementation's stability. That matters: the array is
 * consensus-visible, so every node must produce byte-identical output.
 */
export function compareIndexEntries(a: DaoProposalIndexEntry, b: DaoProposalIndexEntry): number {
  return b.timestamp - a.timestamp || b.number - a.number
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

  const existingIndex = proposals.findIndex((entry) => entry.number === proposalNumber)
  if (existingIndex !== -1) proposals.splice(existingIndex, 1)

  proposals.push({ number: proposalNumber, status, emergencyFlag, timestamp: txTimestamp })

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
