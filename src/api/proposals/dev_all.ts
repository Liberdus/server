import * as configs from '../../config'
import * as crypto from '../../crypto'

export const dev_all = dapp => async (req, res): Promise<void> => {
  try {
    const network = await dapp.getLocalOrRemoteAccount(configs.networkAccount)
    const devProposals = []
    for (let i = 1; i <= network.data.devIssue; i++) {
      const devIssue = await dapp.getLocalOrRemoteAccount(crypto.hash(`dev-issue-${i}`))
      const devProposalCount = devIssue && devIssue.data.devProposalCount
      for (let j = 1; j <= devProposalCount; j++) {
        const devProposal = await dapp.getLocalOrRemoteAccount(crypto.hash(`dev-issue-${i}-dev-proposal-${j}`))
        if (devProposal && devProposal.data) {
          devProposals.push(devProposal.data)
        }
      }
    }
    res.json({ devProposals })
  } catch (error) {
    dapp.log(error)
    res.json({ error })
  }
}
