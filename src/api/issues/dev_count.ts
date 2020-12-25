import * as configs from '../../config'

export const dev_count = dapp => async (req, res): Promise<void> => {
  const network = await dapp.getLocalOrRemoteAccount(configs.networkAccount)
  try {
    res.json({ count: network.data.devIssue })
  } catch (error) {
    dapp.log(error)
    res.json({ error })
  }
}
