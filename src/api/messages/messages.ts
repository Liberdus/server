import { Shardus } from '@shardeum-foundation/core'
import { ChatAccount } from '../../@types'

/**
 * an API like:
  /messages/:chatId/:timestamp which returns only the message that 
  have a timestamp >= the given timestamp. 
  Returns all message if a timestamp is not provided. 
 */

export const messages =
  (dapp: Shardus) =>
  async (req, res): Promise<void> => {
    try {
      const chatId = req.params['chatId']
      const timestampStr = req.params['timestamp']
      const timestamp = Number(timestampStr) || 0
      const account = await dapp.getLocalOrRemoteAccount(chatId)
      if (!account) {
        res.json({ error: "Chat doesn't exist" })
        return
      }
      const chatAccount = account.data as ChatAccount
      if (!chatAccount.messages) {
        res.json({ error: 'no chat history for this request' })
      } else {
        const messages = chatAccount.messages.filter((msg) => msg.timestamp >= timestamp)
        res.json({ messages })
      }
    } catch (error) {
      dapp.log(error)
      res.json({ error })
    }
  }
