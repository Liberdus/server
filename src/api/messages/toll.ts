import { Shardus } from '@shardus/core'
import { ChatAccount } from '../../@types'

export const toll =
  (dapp: Shardus) =>
  async (req, res): Promise<void> => {
    try {
      const chatId = req.params['chatId']
      const account = await dapp.getLocalOrRemoteAccount(chatId)
      if (account && account.data) {
        const { toll, read, replied } = account.data as ChatAccount
        res.json({ toll, read, replied })
      } else {
        res.json({ error: 'No account with the given chatId' })
      }
    } catch (error) {
      dapp.log(error)
      res.json({ error })
    }
  }
