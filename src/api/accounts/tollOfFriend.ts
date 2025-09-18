import * as configs from '../../config'
import * as utils from '../../utils'
import * as AccountsStorage from '../../storage/accountStorage'

export const tollOfFriend = dapp => async (req, res): Promise<void> => {
  try {
    const id = req.params['id']
    const friendId = req.params['friendId']
    if (!id) {
      res.json({
        error: 'No provided id in the route: account/:id/:friendId/toll',
      })
    }
    if (!friendId) {
      res.json({
        error: 'No provided friendId in the route: account/:id/:friendId/toll',
      })
    }
    const account = await dapp.getLocalOrRemoteAccount(id)
    if (account) {
      if (account.data.data.friends[friendId]) {
        res.json({ toll: 0 })
      } else {
        if (account.data.data.toll === null) {
          const network = await dapp.getLocalOrRemoteAccount(configs.networkAccount)
          res.json({ toll: utils.getDefaultTollWei(AccountsStorage.cachedNetworkAccount) })
        } else {
          res.json({ toll: account.data.data.toll })
        }
      }
    } else {
      res.json({ error: 'No account with the given id' })
    }
  } catch (error) {
    dapp.log(error)
    res.json({ error })
  }
}
