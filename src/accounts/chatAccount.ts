import * as crypto from 'shardus-crypto-utils'

export const chatAccount = (accountId: string): ChatAccount => {
  const chat: ChatAccount = {
    id: accountId,
    type: 'ChatAccount',
    messages: [],
    freeReply: {},
    timestamp: 0,
    hash: '',
  }
  chat.hash = crypto.hashObj(chat)
  return chat
}
