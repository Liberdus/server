import * as configs from '../../config'
import * as crypto from 'shardus-crypto-utils'

export const dev_latest = dapp => async (req, res): Promise<void> => {
  try {
    const network = await dapp.getLocalOrRemoteAccount(configs.networkAccount)
    const issue = await dapp.getLocalOrRemoteAccount(crypto.hash(`dev-issue-${network.data.devIssue}`))
    const devProposalCount = issue && issue.data.devProposalCount
    const devProposals = []
    for (let i = 1; i <= devProposalCount; i++) {
      const devProposal = await dapp.getLocalOrRemoteAccount(crypto.hash(`dev-issue-${network.data.devIssue}-dev-proposal-${i}`))
      if (devProposal && devProposal.data) {
        devProposals.push(devProposal.data)
      }
    }
    res.json({ devProposals })
  } catch (error) {
    dapp.log(error)
    res.json({ error })
  }
}
