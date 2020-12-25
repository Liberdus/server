import * as configs from '../../config'

export const count = dapp => async (req, res): Promise<void> => {
  const network = await dapp.getLocalOrRemoteAccount(configs.networkAccount)
  try {
    res.json({count: network.data.issue})
  } catch (error) {
    dapp.log(error)
    res.json({error})
  }
}
