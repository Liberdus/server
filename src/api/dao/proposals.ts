import * as crypto from '../../crypto'
import { DAO_PROPOSALS_META_ID_STRING } from '../../accounts/daoProposalsMetaAccount'
import { DaoProposalsMeta, DaoProposalAccount } from '../../@types'
import { Utils } from '@shardus/lib-types'

const metaId = () => crypto.hash(DAO_PROPOSALS_META_ID_STRING)
const proposalId = (n: number) => crypto.hash(`dao proposal #${n}`)

/**
 * Fixed, not a query parameter. The endpoint takes no parameters at all, so there is nothing to
 * vary this by; clients that want a different window can slice `dao/proposals/meta` themselves.
 */
const SUMMARY_SIZE = 20

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

/**
 * The most recently active proposals, newest first.
 *
 * "Recently active" is not "newest": the index is ordered by last status transition, so a batch of
 * old proposals moving through their lifecycle can push a brand-new proposal out of the window.
 *
 * Returns entries only — number, status, emergencyFlag, timestamp. Callers that need titles or
 * balances follow up with `dao/proposals/:id` for the handful they are displaying, which is the
 * point of the index: one request instead of one per proposal.
 */
export const summary = (dapp) => async (req, res): Promise<void> => {
  try {
    const account = await dapp.getLocalOrRemoteAccount(metaId())
    if (!account || !account.data) {
      res.json({ proposals: [] })
      return
    }
    const meta = account.data as DaoProposalsMeta
    // `proposals` is optional so meta accounts serialized before the index existed still
    // deserialize; on those this correctly reports an empty list until the backfill fills it in.
    const proposals = Array.isArray(meta.proposals) ? meta.proposals.slice(0, SUMMARY_SIZE) : []
    res.send(Utils.safeStringify({ proposals }))
  } catch (error) {
    dapp.log(error)
    res.json({ error })
  }
}

export const get = (dapp) => async (req, res): Promise<void> => {
  try {
    if (!/^\d+$/.test(req.params.id)) {
      res.status(400).json({ error: 'Invalid proposal number' })
      return
    }
    const proposalNumber = parseInt(req.params.id, 10)
    if (!Number.isSafeInteger(proposalNumber) || proposalNumber < 1) {
      res.status(400).json({ error: 'Invalid proposal number' })
      return
    }
    const account = await dapp.getLocalOrRemoteAccount(proposalId(proposalNumber))
    if (!account || !account.data) {
      res.status(404).json({ error: `Proposal #${proposalNumber} not found` })
      return
    }
    res.send(Utils.safeStringify({ proposal: account.data as DaoProposalAccount }))
  } catch (error) {
    dapp.log(error)
    res.json({ error })
  }
}
