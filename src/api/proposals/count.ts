import * as configs from '../../config'
import * as crypto from '../../crypto'

export const count = dapp => async (req, res): Promise<void> => {
  try {
    const network = await dapp.getLocalOrRemoteAccount(configs.networkAccount)
    const issue = await dapp.getLocalOrRemoteAccount(crypto.hash(`issue-${network.data.issue}`))
    res.json({ count: issue && issue.data.proposalCount })
  } catch (error) {
    dapp.log(error)
    res.json({ error })
  }
}
