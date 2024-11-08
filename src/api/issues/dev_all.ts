import * as configs from '../../config'
import * as crypto from '../../crypto'

export const dev_all = dapp => async (req, res): Promise<void> => {
  try {
    const network = await dapp.getLocalOrRemoteAccount(configs.networkAccount)
    const devIssues = []
    for (let i = 1; i <= network.data.devIssue; i++) {
      const devIssue = await dapp.getLocalOrRemoteAccount(crypto.hash(`dev-issue-${i}`))
      if (devIssue && devIssue.data) {
        devIssues.push(devIssue.data)
      }
    }
    res.json({ devIssues })
  } catch (error) {
    dapp.log(error)
    res.json({ error })
  }
}
