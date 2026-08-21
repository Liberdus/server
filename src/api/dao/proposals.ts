import * as crypto from '../../crypto'
import { DAO_PROPOSALS_META_ID_STRING } from '../../accounts/daoProposalsMetaAccount'
import { DaoProposalsMeta, DaoProposalAccount } from '../../@types'
import { Utils } from '@shardus/lib-types'

const metaId = () => crypto.hash(DAO_PROPOSALS_META_ID_STRING)
const proposalId = (n: number) => crypto.hash(`dao proposal #${n}`)

/** Fixed: the endpoint takes no parameters. Clients wanting a different window slice `meta`. */
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
 * The most recently *active* proposals — ordered by last status transition, not by number, so old
 * proposals moving through their lifecycle can push a newer one out of the window.
 *
 * Returns `meta.count` plus index entries only; callers needing titles or balances follow up with
 * `dao/proposals/:id` for just the handful they display.
 */
export const summary = (dapp) => async (req, res): Promise<void> => {
  try {
    const account = await dapp.getLocalOrRemoteAccount(metaId())
    if (!account || !account.data) {
      res.json({ count: 0, proposals: [] })
      return
    }
    const meta = account.data as DaoProposalsMeta
    // `proposals` is optional on pre-index accounts; those correctly report an empty list.
    const proposals = Array.isArray(meta.proposals) ? meta.proposals.slice(0, SUMMARY_SIZE) : []
    res.send(Utils.safeStringify({ count: meta.count, proposals }))
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
