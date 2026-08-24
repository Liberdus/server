import * as configs from '../../config'
import {NetworkAccount} from '../../@types'

export const current = dapp => async (req, res): Promise<void> => {
  try {
    const account = await dapp.getLocalOrRemoteAccount(configs.networkAccount)
    const network: NetworkAccount = account.data
    res.json({
      parameters: {
        current: network.current,
        listOfChanges: network.listOfChanges,
      },
    })
  } catch (error) {
    dapp.log(error)
    res.json({ error })
  }
}
