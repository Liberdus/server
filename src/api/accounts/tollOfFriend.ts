import * as configs from '../../config'
import * as crypto from 'shardus-crypto-utils'

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
    const chat = await dapp.getLocalOrRemoteAccount(crypto.hash([...id, ...friendId].sort().join('')))
    const account = await dapp.getLocalOrRemoteAccount(id)
    if (chat) {
      if (chat.data.freeReply[friendId]) {
        res.json({ toll: 0 })
      }
    } else if (account) {
      if (account.data.data.toll === null) {
        const network = await dapp.getLocalOrRemoteAccount(configs.networkAccount)
        res.json({ toll: network.data.current.defaultToll })
      } else {
        res.json({ toll: account.data.data.toll })
      }
    } else {
      res.json({ error: 'No account with the given id' })
    }
  } catch (error) {
    dapp.log(error)
    res.json({ error })
  }
}
