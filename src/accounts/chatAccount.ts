import * as crypto from '../crypto'
import { VectorBufferStream } from '@shardus/core'
import { SerdeTypeIdent } from '.'
import { ChatAccount, Tx } from '../@types'
import * as utils from '../utils'
import { readBigIntDecimal, readJson, readSafeNumber, writeBigIntDecimal, writeJson, writeSafeNumber } from '../utils/binaryFields'

export const chatAccount = (accountId: string, tx: Tx.Message | Tx.Transfer | Tx.ReclaimToll): ChatAccount => {
  // Ensure lowercase accountId
  accountId = accountId.toLowerCase()
  const chat: ChatAccount = {
    id: accountId,
    type: 'ChatAccount',
    messages: [],
    toll: {
      required: [1, 1],
      payOnRead: [0n, 0n],
      payOnReply: [0n, 0n],
    },
    read: [0, 0],
    replied: [0, 0],
    timestamp: 0,
    hash: '',
    hasChats: false,
  }

  const [addr1, addr2] = utils.sortAddresses(tx.from, tx.to)
  // set the required toll of the sender to 0 so that replier will not have to pay toll
  const senderIndex = addr1 === tx.from ? 0 : 1
  chat.toll.required[senderIndex] = 0

  chat.hash = crypto.hashObj(chat)
  return chat
}

export const serializeChatAccount = (stream: VectorBufferStream, inp: ChatAccount, root = false): void => {
  const { id, type, messages, toll, read, replied, timestamp, hash, hasChats, ...extra } = inp
  const { required, payOnRead, payOnReply, ...tollExtra } = toll
  if (![required, payOnRead, payOnReply, read, replied].every((pair) => Array.isArray(pair) && pair.length === 2)) {
    throw new Error('ChatAccount toll and timestamp fields must have exactly two entries')
  }
  if (required.some((value) => !Number.isInteger(value) || value < 0 || value > 255)) {
    throw new Error('ChatAccount toll.required entries must be unsigned bytes')
  }
  if (typeof hasChats !== 'boolean') throw new Error('ChatAccount hasChats must be a boolean')
  if (root) stream.writeUInt16(SerdeTypeIdent.ChatAccount)
  stream.writeString(id)
  stream.writeString(type)
  writeJson(stream, messages)
  stream.writeUInt8(required[0])
  stream.writeUInt8(required[1])
  for (const amount of [...payOnRead, ...payOnReply]) writeBigIntDecimal(stream, amount)
  for (const time of [...read, ...replied]) writeSafeNumber(stream, time)
  writeSafeNumber(stream, timestamp)
  stream.writeString(hash)
  stream.writeUInt8(hasChats ? 1 : 0)
  writeJson(stream, tollExtra)
  writeJson(stream, extra)
}

export const deserializeChatAccount = (stream: VectorBufferStream, root = false): ChatAccount => {
  if (root && stream.readUInt16() !== SerdeTypeIdent.ChatAccount) {
    throw new Error('Unexpected bufferstream for ChatAccount type')
  }

  const id = stream.readString()
  const type = stream.readString()
  const messages = readJson<ChatAccount['messages']>(stream)
  const required = [stream.readUInt8(), stream.readUInt8()] as ChatAccount['toll']['required']
  const payOnRead = [readBigIntDecimal(stream), readBigIntDecimal(stream)] as ChatAccount['toll']['payOnRead']
  const payOnReply = [readBigIntDecimal(stream), readBigIntDecimal(stream)] as ChatAccount['toll']['payOnReply']
  const read = [readSafeNumber(stream), readSafeNumber(stream)] as ChatAccount['read']
  const replied = [readSafeNumber(stream), readSafeNumber(stream)] as ChatAccount['replied']
  const timestamp = readSafeNumber(stream)
  const hash = stream.readString()
  const hasChats = stream.readUInt8() === 1
  const tollExtra = readJson<Record<string, unknown>>(stream)
  const extra = readJson<Record<string, unknown>>(stream)
  return { id, type, messages, toll: { required, payOnRead, payOnReply, ...tollExtra }, read, replied, timestamp, hash, hasChats, ...extra }
}
