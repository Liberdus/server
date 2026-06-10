import * as crypto from '../../crypto'
import { DaoProposalAccount } from '../../@types'
import * as utils from '../../utils'

export const list = (dapp) => async (req, res): Promise<void> => {
  try {
    const proposalId = req.params.proposalId
    if (typeof proposalId !== 'string' || !utils.isValidAddress(proposalId)) {
      res.status(400).json({ error: 'Invalid proposalId: must be a 64-char hex string' })
      return
    }
    const account = await dapp.getLocalOrRemoteAccount(proposalId)
    if (!account || !account.data) {
      res.status(404).json({ error: 'Proposal not found' })
      return
    }
    const proposal = account.data as DaoProposalAccount
    res.json({
      proposalId,
      voterList: proposal.voterList,
      claimList: proposal.claimList,
      voterCount: proposal.voterList.length,
      claimCount: proposal.claimList.length,
    })
  } catch (error) {
    dapp.log(error)
    res.json({ error })
  }
}
