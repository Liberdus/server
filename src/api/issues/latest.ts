import * as configs from '../../config'
import * as crypto from 'shardus-crypto-utils'

export const latest = dapp => async (req, res): Promise<void> => {
  try {
    const network = await dapp.getLocalOrRemoteAccount(configs.networkAccount)
    const issue = await dapp.getLocalOrRemoteAccount(
      crypto.hash(`issue-${network.data.issue}`)
    )
    res.json({issue: issue && issue.data})
  } catch (error) {
    dapp.log(error)
    res.json({error})
  }
}
