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
    gracePeriod: 0,
    proposalFeeUsdStr: '0',
    voteThresholdUsdStr: '0',
    minimumSpendUsdStr: '0',
    voteExponent: 1.1,
    pctBurned: 50,
    reviewDuration: 0,
    votingDuration: 0,
    graceDuration: 0,
    claimDuration: 0,
    committeeAddresses: [],
    committeeVotes: [],
    options: [],
    totalVote: [],
    voterRewardPool: 0n,
    claimedReward: 0n,
    voterList: [],
    claimList: [],
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
 * Only `creationTime` and `startTime` are stored on the account; every other phase-boundary
 * timestamp (reviewEnd, votingStart, votingEnd, claimEnd, applyEligibleAt) is a pure function
 * of `startTime` plus the duration fields snapshotted on the proposal at creation time.
 *
 * Schedule (identical shape for regular and emergency proposals — emergency proposals simply
 * have a zero-length nominal voting phase, so votingEnd collapses onto votingStart/reviewEnd):
 *   reviewEnd     = startTime + reviewDuration
 *   votingStart   = reviewEnd                                  (fixed; community voting never
 *                                                               starts early, even on a decisive
 *                                                               committee accept)
 *   votingEnd     = emergency ? votingStart : votingStart + votingDuration
 *   claimEnd      = votingEnd + claimDuration
 *   applyEligible = votingEnd + gracePeriod
 */
export function getReviewEnd(proposal: DaoProposalAccount): number {
  return proposal.startTime + proposal.reviewDuration
}

export function getVotingStart(proposal: DaoProposalAccount): number {
  return getReviewEnd(proposal)
}

export function getVotingEnd(proposal: DaoProposalAccount): number {
  const votingStart = getVotingStart(proposal)
  return proposal.emergency ? votingStart : votingStart + proposal.votingDuration
}

export function getClaimEnd(proposal: DaoProposalAccount): number {
  return getVotingEnd(proposal) + proposal.claimDuration
}

export function getApplyEligibleAt(proposal: DaoProposalAccount): number {
  return getVotingEnd(proposal) + proposal.gracePeriod
}
