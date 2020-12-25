import * as configs from '../../config'
import * as crypto from 'shardus-crypto-utils'

export const dev_count = dapp => async (req, res): Promise<void> => {
  try {
    const network = await dapp.getLocalOrRemoteAccount(configs.networkAccount)
    const devIssue = await dapp.getLocalOrRemoteAccount(crypto.hash(`dev-issue-${network.data.devIssue}`))
    res.json({ count: devIssue && devIssue.data.devProposalCount })
  } catch (error) {
    dapp.log(error)
    res.json({ error })
  }
}
