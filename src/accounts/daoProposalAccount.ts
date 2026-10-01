import * as crypto from '../crypto'
import { DaoProposalAccount, DaoProposalType, DaoProposalStatus } from '../@types'
import { VectorBufferStream } from '@shardus/core'
import { SerdeTypeIdent } from '.'
import { Utils } from '@shardus/lib-types'

export function daoProposalAccount(id: string): DaoProposalAccount {
  const account: DaoProposalAccount = {
    id,
    type: 'DaoProposalAccount',
    status: 'review' as DaoProposalStatus,
    emergency: false,
    proposalType: 'governance' as DaoProposalType,
    number: 0,
    creationTime: 0,
    startTime: 0,
    // votingStartedAt/votingEndedAt intentionally omitted — written lazily on transition,
    // permanently absent for emergency proposals.
    gracePeriod: 0,
    proposalFeeUsdStr: '0',
    voteThresholdUsdStr: '0',
    minimumSpendUsdStr: '0',
    voteExponent: 0.1,
    pctBurned: 50,
    reviewDuration: 0,
    votingDuration: 0,
    graceDuration: 0,
    claimDuration: 0,
    committeeAddresses: [],
    committeeVotes: [],
    // unapplyVotes intentionally omitted — created lazily by the handler on first
    // dao_unapply_parameters submission, not carried by every proposal from creation.
    // project intentionally omitted for the same reason — only project proposals have one.
    options: [],
    totalVote: [],
    voterRewardPool: 0n,
    claimedReward: 0n,
    initialBurnedReward: 0n,
    finalBurnedReward: 0n,
    voterList: [],
    claimList: [],
    title: '',
    description: '',
    hash: '',
    timestamp: 0,
  }
  account.hash = crypto.hashObj(account)
  return account
}

export function serializeDaoProposalAccount(stream: VectorBufferStream, inp: DaoProposalAccount, root = false): void {
  if (root) {
    stream.writeUInt16(SerdeTypeIdent.DaoProposalAccount)
  }
  stream.writeString(Utils.safeStringify(inp))
}

export function deserializeDaoProposalAccount(stream: VectorBufferStream): DaoProposalAccount {
  return Utils.safeJsonParse(stream.readString()) as DaoProposalAccount
}

/**
 * Derived proposal-timeline helpers — single source of truth for every phase boundary.
 *
 * creationTime just records when the proposal was created. startTime feeds into reviewEnd.
 *
 * votingStartedAt is the real time dao_committee_result ran — the moment the proposal actually
 * moved to 'voting'. votingEndedAt is the real time dao_vote_result ran, finishing the vote.
 * Anyone can submit these transactions for a fee, so they can run late. Before that happens —
 * and always, for emergency proposals — votingStart uses reviewEnd instead, and
 * claimEnd/applyEligible use votingEnd instead. So a late transaction only delays later phases.
 * It never makes them shorter.
 *
 * Schedule:
 *   reviewEnd     = startTime + reviewDuration
 *   votingStart   = votingStartedAt ?? reviewEnd
 *   votingEnd     = emergency ? votingStart : votingStart + votingDuration
 *   claimEnd      = (votingEndedAt ?? votingEnd) + claimDuration
 *   applyEligible = (votingEndedAt ?? votingEnd) + gracePeriod
 */
export function getReviewEnd(proposal: DaoProposalAccount): number {
  return proposal.startTime + proposal.reviewDuration
}

export function getVotingStart(proposal: DaoProposalAccount): number {
  return proposal.votingStartedAt ?? getReviewEnd(proposal)
}

export function getVotingEnd(proposal: DaoProposalAccount): number {
  const votingStart = getVotingStart(proposal)
  // votingEnd is a deadline voters need to know in advance, so it never depends on when
  // dao_vote_result actually runs.
  return proposal.emergency ? votingStart : votingStart + proposal.votingDuration
}

export function getClaimEnd(proposal: DaoProposalAccount): number {
  // The claim window is measured from votingEndedAt (the real dao_vote_result time) once it's
  // set, or from the scheduled votingEnd until then.
  const votingEndedAt = proposal.votingEndedAt ?? getVotingEnd(proposal)
  return votingEndedAt + proposal.claimDuration
}

export function getApplyEligibleAt(proposal: DaoProposalAccount): number {
  const votingEndedAt = proposal.votingEndedAt ?? getVotingEnd(proposal)
  return votingEndedAt + proposal.gracePeriod
}
