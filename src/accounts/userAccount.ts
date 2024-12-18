import { UserAccount } from '../@types'
import { VectorBufferStream } from '@shardus/core'
import * as crypto from '@shardus/crypto-utils'
import { deserializeDeveloperPayment, SerdeTypeIdent, serializeDeveloperPayment } from '.'

export const userAccount = (accountId: string, timestamp: number) => {
  const account: UserAccount = {
    id: accountId,
    type: 'UserAccount',
    data: {
      balance: BigInt(50),
      stake: BigInt(0),
      remove_stake_request: null,
      toll: null,
      chats: {},
      friends: {},
      payments: [],
    },
    alias: null,
    emailHash: null,
    verified: false,
    hash: '',
    claimedSnapshot: false,
    lastMaintenance: timestamp,
    timestamp: 0,
    publicKey: '',
  }
  account.hash = crypto.hashObj(account)
  return account
}

export const serializeUserAccount = (stream: VectorBufferStream, inp: UserAccount, root = false): void => {
  if(root){
    stream.writeUInt16(SerdeTypeIdent.UserAccount)
  }

  stream.writeString(inp.id)
  stream.writeString(inp.type)
  stream.writeUInt32(inp.data.balance)
  stream.writeUInt8(inp.data.toll ? 1 : 0)
  if(inp.data.toll){
    stream.writeUInt32(inp.data.toll)
  }
  stream.writeUInt32(Object.keys(inp.data.chats).length)
  for(const key in inp.data.chats){
    stream.writeString(key)
    stream.writeString(inp.data.chats[key])
  }
  stream.writeUInt32(Object.keys(inp.data.friends).length)
  for(const key in inp.data.friends){
    stream.writeString(key)
    stream.writeString(inp.data.friends[key])
  }
  stream.writeUInt8(inp.data.stake ? 1 : 0)
  if(inp.data.stake){
    stream.writeUInt32(inp.data.stake)
  }
  stream.writeUInt8(inp.data.remove_stake_request ? 1 : 0)
  if(inp.data.remove_stake_request){
    stream.writeUInt32(inp.data.remove_stake_request)
  }
  stream.writeUInt32(inp.data.payments.length)
  for(let i = 0; i < inp.data.payments.length; i++){
    serializeDeveloperPayment(stream, inp.data.payments[i])
  }
  stream.writeUInt8(inp.alias ? 1 : 0)
  if(inp.alias){
    stream.writeString(inp.alias)
  }
  stream.writeUInt8(inp.emailHash ? 1 : 0)
  if(inp.emailHash){
    stream.writeString(inp.emailHash)
  }
  stream.writeUInt8(inp.verified ? 1 : 0)
  stream.writeUInt32(inp.lastMaintenance)
  stream.writeUInt8(inp.claimedSnapshot ? 1 : 0)
  stream.writeBigUInt64(BigInt(inp.timestamp))
  stream.writeString(inp.hash)
}


export const deserializeUserAccount = (stream: VectorBufferStream, root = false): UserAccount => {
  if(root && (stream.readUInt16() !== SerdeTypeIdent.UserAccount)){
    throw new Error("Unexpected bufferstream for UserAccount type");
  }

  const id = stream.readString()
  const type = stream.readString()
  const balance = stream.readUInt32()
  const toll = stream.readUInt8() ? stream.readUInt32() : null
  const chats = {}
  for(let i = 0; i < stream.readUInt32(); i++){
    chats[stream.readString()] = stream.readString()
  }
  const friends = {}
  for(let i = 0; i < stream.readUInt32(); i++){
    friends[stream.readString()] = stream.readString()
  }
  const stake = stream.readUInt8() ? stream.readUInt32() : null
  const remove_stake_request = stream.readUInt8() ? stream.readUInt32() : null
  const payments = []
  for(let i = 0; i < stream.readUInt32(); i++){
    payments.push(deserializeDeveloperPayment(stream))
  }
  const alias = stream.readUInt8() ? stream.readString() : null
  const emailHash = stream.readUInt8() ? stream.readString() : null
  const verified = stream.readUInt8() === 1 ? true : false
  const lastMaintenance = stream.readUInt32()
  const claimedSnapshot = stream.readUInt8() === 1 ? true : false
  const timestamp = Number(stream.readBigUInt64())
  const hash = stream.readString()
  return {
    id,
    type,
    data: {
      balance,
      toll,
      chats,
      friends,
      stake,
      remove_stake_request,
      payments,
    },
    alias,
    emailHash,
    verified,
    lastMaintenance,
    claimedSnapshot,
    timestamp,
    hash,
  }

}
