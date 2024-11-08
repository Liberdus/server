import * as configs from '../../config'
import * as crypto from '../../crypto'

export const dev_latest = dapp => async (req, res): Promise<void> => {
  const network = await dapp.getLocalOrRemoteAccount(configs.networkAccount)
  try {
    const devIssue = await dapp.getLocalOrRemoteAccount(crypto.hash(`dev-issue-${network.data.devIssue}`))
    res.json({ devIssue: devIssue && devIssue.data })
  } catch (error) {
    dapp.log(error)
    res.json({ error })
  }
}
