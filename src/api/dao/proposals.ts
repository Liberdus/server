import * as crypto from '../../crypto'
import { DAO_PROPOSALS_META_ID_STRING } from '../../accounts/daoProposalsMetaAccount'
import { DaoProposalsMeta, DaoProposalAccount, DaoProposalStatus } from '../../@types'
import { Utils } from '@shardus/lib-types'
import { getReviewEnd, getVotingStart, getVotingEnd, getClaimEnd, getApplyEligibleAt } from '../../accounts/daoProposalAccount'

const metaId = () => crypto.hash(DAO_PROPOSALS_META_ID_STRING)
const proposalId = (n: number) => crypto.hash(`dao proposal #${n}`)

// Only `creationTime`/`startTime` are stored on DaoProposalAccount — every other phase-boundary
// timestamp is derived from those plus the duration snapshots (see
// src/accounts/daoProposalAccount.ts). API consumers (web client, explorer, E2E scripts)
// shouldn't need to reimplement those formulas, so every proposal response is decorated with
// the derived fields here.
type DaoProposalWithDerivedTiming = DaoProposalAccount & {
  reviewEnd: number
  votingStart: number
  votingEnd: number
  claimEnd: number
  applyEligibleAt: number
}

const withDerivedTiming = (proposal: DaoProposalAccount): DaoProposalWithDerivedTiming => ({
  ...proposal,
  reviewEnd: getReviewEnd(proposal),
  votingStart: getVotingStart(proposal),
  votingEnd: getVotingEnd(proposal),
  claimEnd: getClaimEnd(proposal),
  applyEligibleAt: getApplyEligibleAt(proposal),
})

export const meta = (dapp) => async (req, res): Promise<void> => {
  try {
    const account = await dapp.getLocalOrRemoteAccount(metaId())
    if (!account || !account.data) {
      res.json({ meta: null })
      return
    }
    res.send(Utils.safeStringify({ meta: account.data as DaoProposalsMeta }))
  } catch (error) {
    dapp.log(error)
    res.json({ error })
  }
}

export const all = (dapp) => async (req, res): Promise<void> => {
  try {
    const metaAccount = await dapp.getLocalOrRemoteAccount(metaId())
    if (!metaAccount || !metaAccount.data) {
      res.json({ proposals: [] })
      return
    }
    const count: number = (metaAccount.data as DaoProposalsMeta).count
    const statusFilter: DaoProposalStatus | undefined = req.query.status as DaoProposalStatus | undefined

    const proposals: DaoProposalWithDerivedTiming[] = []
    for (let i = 1; i <= count; i++) {
      const account = await dapp.getLocalOrRemoteAccount(proposalId(i))
      if (account && account.data) {
        const proposal = account.data as DaoProposalAccount
        if (!statusFilter || proposal.status === statusFilter) {
          proposals.push(withDerivedTiming(proposal))
        }
      }
    }
    res.send(Utils.safeStringify({ proposals }))
  } catch (error) {
    dapp.log(error)
    res.json({ error })
  }
}

export const single = (dapp) => async (req, res): Promise<void> => {
  try {
    const proposalNumber = parseInt(req.params.id, 10)
    if (isNaN(proposalNumber) || proposalNumber < 1) {
      res.status(400).json({ error: 'Invalid proposal number' })
      return
    }
    const account = await dapp.getLocalOrRemoteAccount(proposalId(proposalNumber))
    if (!account || !account.data) {
      res.status(404).json({ error: `Proposal #${proposalNumber} not found` })
      return
    }
    res.send(Utils.safeStringify({ proposal: withDerivedTiming(account.data as DaoProposalAccount) }))
  } catch (error) {
    dapp.log(error)
    res.json({ error })
  }
}
