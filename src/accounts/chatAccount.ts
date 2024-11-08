import * as crypto from '../crypto'
import {ChatAccount} from '../@types'

export const chatAccount = (accountId: string): ChatAccount => {
  const chat: ChatAccount = {
    id: accountId,
    type: 'ChatAccount',
    messages: [],
    timestamp: 0,
    hash: '',
  }
  chat.hash = crypto.hashObj(chat)
  return chat
}
