import * as configs from '../../config'
import * as crypto from '../../crypto'

export const all = dapp => async (req, res): Promise<void> => {
  try {
    const network = await dapp.getLocalOrRemoteAccount(configs.networkAccount)
    const issues = []
    for (let i = 1; i <= network.data.issue; i++) {
      const issue = await dapp.getLocalOrRemoteAccount(crypto.hash(`issue-${i}`))
      if (issue && issue.data) {
        issues.push(issue.data)
      }
    }
    res.json({ issues })
  } catch (error) {
    dapp.log(error)
    res.json({ error })
  }
}
